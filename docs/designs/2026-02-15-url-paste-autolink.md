# URL Paste Autolink — Design Artifact

Design artifact for automatically creating links when pasting URLs in
Reflection Notes.

## References

- `docs/designs/link-decision-table.md` — link handling decision matrix
- `docs/designs/link-popover-state-event.md` — link popover interaction
- GFM §6.9 — extended autolinks: https://github.github.com/gfm/#autolinks-extension-
- WHATWG URL Standard: https://url.spec.whatwg.org/

## Scope

This artifact covers only **paste** behavior. Specifically:

1. Pasting a URL from plain text clipboard (no selection)
2. Pasting a URL from plain text clipboard onto a selection (making selected
   text a link)
3. Sanitization cleanup for HTML paste with `<a>` tags (existing behavior)

**Explicitly deferred:**

- `www.` URLs without scheme (typing-autolink problem)
- Email autolinks
- Retroactive autolinking of typed text on commit boundary
- Extracting URLs from mixed plain text
- Internal / relative-path linking between notes

## Feature Classification

**Hybrid.** The no-selection case is pure data transformation (clipboard
text → text with link mark). The selection case has interaction with the
link decision table and requires specifying behavior across the selection
type × link coverage matrix.

---

## Shared: URL Validation

### `isSafeHref(href: string): boolean`

A single validation function used by both the paste handler and the
schema's `parseDOM` for `<a>` tags. Replaces the current hand-rolled
regex in the link mark's `parseDOM`.

```
function isSafeHref(href: string): boolean {
    try {
        const url = new URL(href);
        return url.protocol === "http:"
            || url.protocol === "https:"
            || url.protocol === "mailto:";
    } catch {
        return false;
    }
}
```

No base URL parameter — relative paths like `/foo` fail to parse and
return false. Only absolute URLs with an explicit scheme are accepted.
There is no internal-linking feature, so relative paths would resolve
against the PWA origin, which is meaningless.

### `isHttpUrl(text: string): boolean`

A stricter check for the paste-autolink feature. Only accepts absolute
http/https URLs with a non-empty hostname. Does not accept `mailto:`.

```
function isHttpUrl(text: string): boolean {
    if (!URL.canParse(text)) return false;
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:")
        && url.hostname !== "";
}
```

### Cleanup: Replace Regex in `parseDOM`

The existing `parseDOM` for the link mark in `schema.ts`:

```typescript
// BEFORE
if (!/^(https?|mailto):/i.test(href) && !href.startsWith("/")) {
    return false;
}

// AFTER
if (!isSafeHref(href)) {
    return false;
}
```

This is a behavior change: relative paths (`/foo`) are now rejected.
This is intentional — there is no internal linking feature, and relative
hrefs resolve against the PWA origin, producing broken links.

---

## Clipboard Priority Model

The paste handler checks clipboard types in a fixed priority order.
It takes the first match and stops. It does **not** cross-examine the
contents of lower-priority types.

```
handlePaste(view, event, slice):
    types = clipboardData.types

    1. if types has Files       → image paste handler    (existing)
    2. if types has text/html   → HTML paste handler     (existing, with isSafeHref)
    3. if types has text/plain  → URL autolink check     (NEW — Parts 1 & 2)
                                  if not a URL → return false
                                                 (ProseMirror default paste)
```

This means: if the clipboard advertises `text/html`, we always use the
HTML representation, even if `text/plain` happens to be a URL. The
source app chose to provide rich content; we respect that. The URL
autolink only fires when plain text is the best representation available.

---

## Part 1: Paste URL, No Selection (Collapsed Cursor)

The clipboard contains a URL; there is no selected text. The URL becomes
both the visible text and the href.

### Flow Table

| Stage | Input | Operation | Output | Notes |
|-------|-------|-----------|--------|-------|
| **1. Extract** | `clipboardData` | `candidate = clipboardData.getData("text/plain").trim()` | `candidate: string` | `getData("text/plain")` handles `text/plain;charset=utf-8` too. |
| **2. Quick reject** | `candidate` | `/^https?:\/\//i.test(candidate)` | If no match → **stop**, return false. | Fast path: skips URL constructor for obvious non-URLs. |
| **3. Multiline reject** | `candidate` | Check for `\n` or `\r` | If found → **stop**, return false. | Multiple lines cannot be a single URL. |
| **4. Validate** | `candidate` | `isHttpUrl(candidate)` | If false → **stop**, return false. | Catches malformed URLs, empty hostnames, non-http schemes. |
| **5. Normalize** | `candidate` | `const parsed = new URL(candidate)` | `href = parsed.href` | Canonicalizes scheme/host casing, encodes special chars. |
| **6. Check selection** | `state.selection` | Is the selection collapsed (empty)? | If collapsed → continue to stage 7. If non-empty → **go to Part 2**. | Branch point between the two paste behaviors. |
| **7. Build transaction** | `href`, `state` | Insert `candidate` as text with `link` mark, `href` = normalized `href`. Then `tr.removeStoredMark(schema.marks.link)`. | `Transaction` | Display text = raw copied text. Href = normalized form. StoredMark cleared so next typed char is unlinked. |
| **8. Dispatch** | `tr` | `view.dispatch(tr)`, return `true` | State updated | Returning true prevents default paste. |

### Cursor Position After Paste

Cursor ends up immediately after the inserted link text. `storedMarks`
does **not** include the link mark (explicitly removed in stage 7).
Next character typed is plain text.

### Edge Cases

| Clipboard content | Result | Rationale |
|-------------------|--------|-----------|
| `https://example.com` | Autolink | Happy path. |
| `https://example.com/path?q=hello&x=1#frag` | Autolink | Query + fragment valid. |
| `http://localhost:3000/foo` | Autolink | Dev URLs are legit. |
| `https://example.com/path with spaces` | Default paste (plain text) | `URL.canParse` → false. |
| `https://` | Default paste | `hostname === ""` check catches this. |
| `  https://example.com  ` | Autolink (trimmed) | Leading/trailing whitespace from copy. |
| `https://example.com\nhttps://other.com` | Default paste | Multiline reject (stage 3). |
| `HTTPS://EXAMPLE.COM` | Autolink. Display: `HTTPS://EXAMPLE.COM`, href: `https://example.com/` | User sees what they copied; href is canonical. |
| `https://example.com.` | Autolink | We trust the clipboard. No GFM tail-trimming. |
| `ftp://example.com` | Default paste | `isHttpUrl` rejects non-http schemes. |

---

## Part 2: Paste URL Onto Selection

The clipboard contains a URL. The user has text selected. Instead of
replacing the selected text with the URL, we **keep the selected text
and make it a link** with the pasted URL as href.

This is the paste-time equivalent of Ctrl/Cmd-K → type URL → Enter,
compressed into one gesture.

### Trigger

Same stages 1–5 as Part 1. At stage 6 the selection is non-empty.

### Selection × Link Coverage Matrix

The selection may or may not already overlap existing links. This matrix
defines behavior for each case and is consistent with the Ctrl/Cmd-K
behavior in `link-decision-table.md`.

#### 2a. Single-block selection, no existing links

The common case: user selects "click here", pastes a URL.

| Stage | Operation |
|-------|-----------|
| Build `tr` | `tr.addMark(sel.from, sel.to, schema.marks.link.create({ href }))` |
| Cursor | Collapse selection to `sel.to`. Remove stored link mark. |
| Result | Selected text is now a link. Cursor after the link, unlinked. |

#### 2b. Single-block selection, entirely inside one existing link

User selects part of (or all of) an already-linked word and pastes a URL.
This **replaces the href** on the entire contiguous link range (not just
the selected portion). Rationale: partial re-linking within a link is
confusing; links are atomic in the user's mental model.

| Stage | Operation |
|-------|-----------|
| Find extent | Walk left/right from selection to find full contiguous link range. |
| Build `tr` | Remove old link mark over full range. Add new link mark with new `href` over full range. |
| Cursor | Collapse to `sel.to`. Remove stored link mark. |
| Result | Entire existing link now has new href. |

#### 2c. Single-block selection, spans multiple links or mix of linked/unlinked

User selects across a link boundary. Paste-to-link **unifies**: remove
all existing link marks in the selection range, apply one new link mark
over the entire selection.

| Stage | Operation |
|-------|-----------|
| Build `tr` | `tr.removeMark(sel.from, sel.to, schema.marks.link)` then `tr.addMark(sel.from, sel.to, schema.marks.link.create({ href }))` |
| Cursor | Collapse to `sel.to`. Remove stored link mark. |
| Result | Entire selection is one link with the pasted href. Former links absorbed. |

#### 2d. Multi-block selection

Selection spans two or more block nodes (e.g., end of one paragraph into
the start of the next). ProseMirror marks cannot span block boundaries.

**Decision: Apply link mark per-block.** Apply the link mark independently
within each block that the selection covers. Each block gets its own link
mark range with the same href. All mark operations happen in a single
transaction → one undo step. This is consistent with how Ctrl/Cmd-K
behaves for multi-block selections in the link decision table.

`tr.addMark` across a range that spans blocks already does the right
thing in ProseMirror — it applies the mark only to inline content within
each block. ??? *Verify this ProseMirror behavior during implementation.*

| Stage | Operation |
|-------|-----------|
| Build `tr` | `tr.removeMark(sel.from, sel.to, schema.marks.link)` then `tr.addMark(sel.from, sel.to, schema.marks.link.create({ href }))` |
| Cursor | Collapse to `sel.to`. Remove stored link mark. |
| Result | Each block has its own link mark. All share the same href. Single undo reverts all. |

### Interaction With Link Popover

Paste-to-link does **not** open the popover. The link is created
immediately on paste. If the user wants to edit the href afterwards,
they place the cursor inside the link and press Ctrl/Cmd-K (which opens
the popover showing the href).

Paste is an immediate action (no intermediate UI). Ctrl/Cmd-K is the
deliberate "I want to inspect/edit link properties" gesture.

### Interaction With Other Marks

The pasted link mark is added on top of whatever marks the selected text
already has. If the selected text is bold+italic, it becomes
bold+italic+linked. `addMark` preserves existing marks — this is default
ProseMirror behavior and requires no special handling.

### Edge Case: Selection Contains Only Whitespace

Paste-to-link still applies. The link will contain whitespace. This is
the least-surprising behavior — the user selected something and pasted
a URL onto it. We don't second-guess their intent.

### Edge Case: Selection Contains Images

If the selection includes inline image nodes, the link mark applies to
the text portions. Images are atom nodes and may not take marks.
??? *Verify ProseMirror behavior with marks on atom nodes during
implementation.*

---

## Part 3: HTML Paste With `<a>` Tags (Cleanup Only)

No new behavior. ProseMirror's paste pipeline already parses `<a>` tags
via the schema's DOMParser. The only change is replacing the regex
validation with `isSafeHref()` in the link mark's `parseDOM`:

```typescript
// In schema.ts, link mark parseDOM getAttrs:
const href = (dom as HTMLElement).getAttribute("href") || "";
if (!isSafeHref(href)) {
    return false;  // Strip link, keep text
}
return { href, title: (dom as HTMLElement).getAttribute("title") };
```

This rejects `javascript:`, `data:`, `vbscript:`, and relative paths.
Previously, relative paths starting with `/` were accepted; they are
now rejected because there is no internal linking feature.

---

## Undo Behavior

Both Part 1 (insert URL as linked text) and Part 2 (apply link to
selection) produce a single transaction. Ctrl/Cmd-Z after paste:

- **Part 1:** Removes the inserted linked text entirely (returns to
  state before paste).
- **Part 2:** Removes the link mark from the selected text (returns
  text to its previous unlinked or differently-linked state). The text
  itself is preserved since we never replaced it.

---

## Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| URL validation | `URL` constructor + protocol check, not regex | Uses the browser's own parser. Defense in depth. |
| Shared validation | `isSafeHref` for parseDOM (http, https, mailto). `isHttpUrl` for paste (http, https only, requires hostname). | Single source of truth. Clean split between permissive (parseDOM) and strict (paste). |
| Relative paths | Rejected everywhere | No internal linking feature. Would resolve against PWA origin. |
| Clipboard priority | Fixed order: files → HTML → plain text. No cross-examination. | Source app's richest representation wins. |
| Paste trigger | Entire trimmed `text/plain` is a single URL | Avoids URL extraction from mixed text (deferred to typing autolink). |
| Display text (no selection) | Raw copied text, not normalized | User sees what they copied. Href is normalized internally. |
| Display text (selection) | Existing selected text preserved | This is the point of paste-to-link. |
| Cursor after paste | After the link, stored marks exclude link | Prevents accidental link extension. |
| Multi-block paste-to-link | Apply link per block, same href | Consistent with Ctrl/Cmd-K. Single undo step. |
| Popover interaction | Paste-to-link does not open popover | Paste is immediate; Ctrl/Cmd-K is deliberate. |
| GFM tail trimming | None | We trust the clipboard contents. Trimming is for typing autolink. |

## Open Questions (???)

1. Does `tr.addMark` across a multi-block range correctly apply the mark
   only to inline content within each block? (Believed yes, verify
   during implementation.)

2. How do marks interact with inline atom nodes (images) within a
   selection being linked? (Verify during implementation.)

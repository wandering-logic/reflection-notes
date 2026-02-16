# Link Handling — Decision Table

Design artifact for link creation, editing, and removal in Reflection Notes.

## References

- **GFM §6.9 — Autolinks (extended)**: URL recognition and trailing punctuation
  rules. https://github.github.com/gfm/#autolinks-extended-
- **CommonMark §6.7 — Autolinks**: Stricter autolink rules (scheme required).
  https://spec.commonmark.org/0.31.2/#autolinks
- **ProseMirror mark spec**: `inclusive: false` for link marks.
  https://prosemirror.net/docs/ref/#model.MarkSpec.inclusive

## Definitions

| Term | Meaning |
|------|---------|
| **Collapsed** | Caret between two characters, no text selected |
| **Non-empty** | One or more characters selected |
| **Single-block** | Selection within one block node (paragraph, heading, etc.) |
| **Multi-block** | Selection spans two or more block nodes |
| **Link coverage** | How much of the selection overlaps existing link marks |
| **Popover** | Non-modal, inline panel anchored to caret/selection; edits href only |
| **URL** | Text matching GFM extended autolink rules (§6.9) |
| **Commit boundary** | Space, Enter, or punctuation that terminates a typed token |

## Schema Constraint

Link mark has `inclusive: false`. Typing at either edge of a link produces
unlinked text. This is the default ProseMirror behavior for links and is
already in the schema.

## Gestures

| Gesture | Shortcut |
|---------|----------|
| **Link** | Ctrl/Cmd-K |
| **Unlink** | Ctrl/Cmd-Shift-K |
| **Paste** | Ctrl/Cmd-V |

---

## 1. Collapsed Cursor (Caret)

Link coverage for a collapsed cursor is binary: caret is inside a link, or
it isn't. "Partial overlap" and "multiple links" don't apply.

### 1a. Collapsed, no link at caret

| Action | Outcome |
|--------|---------|
| **Ctrl/Cmd-K** | Open popover with empty URL field focused. User types/pastes URL, presses Enter → URL inserted as visible text with link mark (`href` = visible text). Esc → close popover, nothing inserted. |
| **Paste URL** | Insert URL as visible text. Apply link mark with `href` = pasted text. |
| **Paste non-URL** | Normal insert, no link. |
| **Type URL + commit** | On commit boundary (space, Enter), scan preceding token. If it matches GFM autolink rules, apply link mark to that token retroactively. Trailing punctuation stripped per GFM §6.9. First Backspace after auto-linkification removes the link mark, not the character. |
| **Type non-URL** | Normal insert. |
| **Unlink** | No-op. |

### 1b. Collapsed, inside existing link

| Action | Outcome |
|--------|---------|
| **Ctrl/Cmd-K** | Open popover showing current `href`. User edits, Enter commits new href to the entire contiguous link range. Esc closes, no change. |
| **Paste URL** | ??? See open question A. |
| **Paste non-URL** | Normal insert. Text appears inside the link (caret is between linked characters, so marks apply). |
| **Typing** | Characters inserted inside the link. Gets link mark (caret is interior, not at edge, so `inclusive: false` doesn't strip it). |
| **Unlink** | Remove link mark from the entire contiguous link range containing the caret. Text remains, only mark removed. |

---

## 2. Non-Empty Selection, Single Block

### 2a. Selection contains no links

| Action | Outcome |
|--------|---------|
| **Ctrl/Cmd-K** | Apply link mark to selection with `href` = "". Open popover with URL field focused. Enter commits href. Esc → if `href` still empty, remove the link mark (no ghost links). |
| **Paste URL** | Apply link mark to selection with `href` = pasted URL. Visible text unchanged. Brief status toast with URL + undo hint. |
| **Paste non-URL** | Normal replace. No link. |
| **Typing** | Normal replace. No link. |
| **Unlink** | No-op. |

### 2b. Selection fully inside one link

The selection is a subset of the link's range. Per Policy A ("edit the
whole link"), operations affect the entire contiguous link.

| Action | Outcome |
|--------|---------|
| **Ctrl/Cmd-K** | Open popover showing href. Edits apply to the entire contiguous link range. |
| **Paste URL** | Set the entire contiguous link's `href` to pasted URL. Visible text unchanged. |
| **Paste non-URL** | Normal replace within link. Link mark preserved on replacement text. |
| **Typing** | Replace selected text. Link mark preserved on replacement. (Needs `appendTransaction` plugin to handle PM issue #620 at first-char edge.) |
| **Unlink** | ??? See open question B. |

### 2c. Selection equals entire link text

Same as 2b, but the selection exactly covers the link. All outcomes
identical, with one emphasis: typing a replacement preserves the link mark
and href. This is the "replace the label" use case.

### 2d. Selection partially overlaps one link

Part of the selection is linked, part is not. The linked portion belongs to
one link.

| Action | Outcome |
|--------|---------|
| **Ctrl/Cmd-K** | Unify: apply one link mark over the entire selection. Open popover. If the overlapped link had an href, pre-fill that; otherwise empty. |
| **Paste URL** | Unify: apply link mark over entire selection with `href` = pasted URL. |
| **Paste non-URL** | Normal replace. Mark behavior at insertion point follows ProseMirror defaults. |
| **Typing** | Normal replace. |
| **Unlink** | Remove all link marks within the selection range. (This splits the original link — the portion outside the selection keeps its link.) |

### 2e. Selection spans two or more different links

| Action | Outcome |
|--------|---------|
| **Ctrl/Cmd-K** | Unify: apply one link mark over entire selection. Open popover with URL field empty (ambiguous which href to pre-fill). Overwrites both links' hrefs. |
| **Paste URL** | Unify: apply link mark over entire selection with `href` = pasted URL. |
| **Paste non-URL** | Normal replace. |
| **Typing** | Normal replace. |
| **Unlink** | Remove all link marks within the selection range. |

---

## 3. Non-Empty Selection, Multi-Block

Selection crosses a block boundary (e.g., end of one paragraph into the
next). Link marks are inline-only and cannot span blocks.

| Action | Outcome |
|--------|---------|
| **Ctrl/Cmd-K** | Apply link mark to each text run within the selection, per block. Treat as single undo step. Open popover — edits to href apply to all created/affected ranges simultaneously. |
| **Paste URL** | Apply link mark per block, same as above, with `href` = pasted URL. |
| **Paste non-URL** | Normal replace (ProseMirror default multi-block behavior). |
| **Typing** | Normal replace. |
| **Unlink** | Remove all link marks within selection across all blocks. |

Link coverage sub-cases (no links, inside link, partial, multiple) follow the
same rules as single-block, applied per-block.

---

## 4. Auto-Linkification on Typing

Triggered on commit boundary (space, Enter, or line-ending punctuation).

**Algorithm:**
1. On commit boundary, extract the preceding whitespace-delimited token.
2. Apply GFM extended autolink URL recognition (§6.9).
3. Strip trailing punctuation per GFM rules (balanced parentheses, trailing
   `?!.,:*_~'"`).
4. If the token (after stripping) is a valid URL, apply link mark with
   `href` = normalized URL.
5. The commit-boundary character (space, Enter) lands outside the link mark
   (guaranteed by `inclusive: false`).

**Undo escape hatch:** Immediately after auto-linkification, the first
Backspace removes the link mark (not the character). Second Backspace
deletes normally.

**Period-space special case:** Trailing `.` before space is stripped from URL
and treated as sentence punctuation, per GFM §6.9 trailing punctuation rules.

---

## 5. Mark Preservation on Replacement

When selected text is replaced (by typing or paste), the question is whether
existing marks (link, bold, italic) survive on the replacement text.

**Rule:** If the selection is contained within (or exactly equals) a single
contiguous mark span, the replacement text inherits that mark.

This applies to links and formatting marks equally. For links specifically:
- Select entire link text, type replacement → link preserved, same href, new text.
- Select part of link text, type replacement → link preserved on replacement.
- Select beyond a link's boundaries (mixed coverage), type replacement → no
  link on replacement (ProseMirror default; insertion-point inheritance).

**Implementation note:** `inclusive: false` on links means ProseMirror may
drop the link mark when replacing the first character of a link (PM issue
#620). An `appendTransaction` plugin is needed to detect this case and
re-apply the mark.

---

## Open Questions

### A. Paste URL at collapsed cursor inside existing link

Two interpretations:
1. **Insert the URL as text** inside the link (normal paste; the pasted
   characters become part of the link's visible text). The link's href is
   unchanged.
2. **Update the link's href** to the pasted URL (treat paste as "set link
   target" since content is a URL).

Option 1 is more predictable (paste always inserts text). Option 2 is more
useful (why would you paste a URL into a link's visible text?). Leaning
toward option 1 for consistency — Ctrl/Cmd-K is the explicit "edit href"
gesture.

**Decision:** ???

### B. Unlink with selection inside a link

Two interpretations:
1. **Unlink the entire contiguous link** (consistent with Ctrl/Cmd-K editing
   the whole link — "think of it as one span").
2. **Unlink only the selected portion** (splits the link into up to 3
   fragments: left-still-linked, unlinked-selection, right-still-linked).

The "HTML span" mental model suggests option 1 (you're operating on the
whole `<a>` element). But option 2 gives more precise control.

**Decision:** ???

### C. Ctrl/Cmd-K unify — pre-fill href?

When unifying partial overlap or multi-link, should the popover pre-fill
with the overlapped link's href?
- Single link overlapped: pre-fill makes sense (you're extending that link).
- Two different links: which one? Empty seems safer.

**Decision:** Partial overlap → pre-fill from existing link. Multiple links → empty. (Tentative.)

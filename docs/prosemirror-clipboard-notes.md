# ProseMirror Clipboard Handling Notes

Notes from investigating clipboard copy/paste behavior in ProseMirror.

## The Paste Pipeline

ProseMirror's paste handling follows this order:

```
ClipboardEvent
    ↓
transformPastedHTML(html) → transforms raw HTML before parsing
    ↓
clipboardParser (DOMParser) → parses HTML to Slice
    ↓
transformPasted(slice) → transforms the parsed Slice
    ↓
handlePaste(view, event, slice) → can override, or return false to continue
    ↓
Default insertion logic (uses slice.openStart/openEnd for smart merging)
```

Key insight: `transformPasted` runs **before** `handlePaste`. The slice that `handlePaste` receives has already been through `transformPasted`.

Source: [prosemirror-view/src/input.ts](https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts) `doPaste` function:
```typescript
export function doPaste(view, text, html, preferPlain, event) {
  let slice = parseFromClipboard(view, text, html, preferPlain, view.state.selection.$from)
  if (view.someProp("handlePaste", f => f(view, event, slice || Slice.empty))) return true
  // ... default insertion ...
}
```

## Where to Put Customizations

### Schema `parseDOM`
- How HTML elements become nodes
- Sanitizing attributes (e.g., `isSafeHref` check on `<a>` tags)

### `transformPasted(slice)`
Use when you need to transform parsed content but don't need the clipboard event or selection context:
- Table normalization
- Converting node types (e.g., `title` → `section`)
- ProseMirror still handles insertion

### `handlePaste`
Only use when:
1. You need `event.clipboardData` directly (checking for files, specific MIME types)
2. Behavior depends on selection in ways schema can't express (e.g., URL paste-over-selection to create link)
3. You need async processing before deciding what to insert

**Critical rule**: If you can do your work and then `return false`, do that. Let ProseMirror handle insertion.

## Where Paragraph Wrappers Come From

### On Copy (`serializeForClipboard`)

When you copy inline text from within a paragraph, ProseMirror:
1. Creates a Slice where content is the selected nodes
2. Serializes using `DOMSerializer.serializeFragment()` which calls each node's `toDOM`
3. The slice's `content` **is** a paragraph node containing the text
4. Output: `<p>blah</p>` because that's what `paragraph.toDOM` produces

The slice metadata (`openStart`, `openEnd`) is encoded in a `data-pm-slice` attribute for ProseMirror-to-ProseMirror paste fidelity.

### On Paste (`parseFromClipboard`)

**For plain text:**
```typescript
text.split(/(?:\r\n?|\n)+/).forEach(block => {
  let p = dom.appendChild(document.createElement("p"))
  if (block) p.appendChild(serializer.serializeNode(schema.text(block, marks)))
})
```
Explicitly wraps each line in `<p>`.

**For HTML without `data-pm-slice`:** The `normalizeSiblings` function wraps inline content to fit the schema using `findWrapping`.

## The Design Issue

ProseMirror's clipboard conflates two purposes in `text/html`:
1. **PM-to-PM transfer** — needs slice structure + `data-pm-slice` metadata
2. **External app interop** — should represent user intent, not internal structure

When copying "blah" from a paragraph:
- User intent: copy "blah"
- What external apps receive: `<p>blah</p>` (interpreted as a paragraph)

Result: Pasting into Google Docs between "x" and "o" creates "x", new paragraph "blah", new paragraph "o" instead of "xblaho".

A cleaner design would use:
- `text/html`: Clean HTML representing user intent
- `text/plain`: Plain text
- `application/x-prosemirror-slice`: Full slice with metadata for PM-to-PM

Modern `navigator.clipboard.write()` supports custom MIME types, making this feasible. Tracked in issue #34.

## References

- [ProseMirror Reference manual](https://prosemirror.net/docs/ref/)
- [prosemirror-view/src/input.ts](https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts)
- [prosemirror-view/src/clipboard.ts](https://github.com/ProseMirror/prosemirror-view/blob/master/src/clipboard.ts)

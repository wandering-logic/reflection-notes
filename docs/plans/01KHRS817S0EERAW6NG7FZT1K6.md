# URL Paste Autolink Refactoring Plan

## Goal
Refactor the URL paste autolink code to be cleaner and handle the case where pasted content is an autolink (link where href = text) from another application.

## Unified Flow

1. **Detect if slice is a URL paste:**
   - Plain text that is a valid HTTP URL, OR
   - Has link mark where `href === text` (autolink from another app)
   - If neither → return false, let PM handle normally

2. **Extract `href`** from whichever case matched

3. **Determine link text content:**
   - Default: `linkText = href`
   - If selection is non-empty AND inline (doesn't cross block boundaries):
     `linkText = selected content (preserving marks like bold/italic)`

4. **Construct the link slice:**
   - Create slice containing `linkText` with link mark pointing to `href`

5. **Paste using `tr.replaceSelection(slice)`:**
   - PM handles all structural fixup (empty selection inserts, non-empty replaces, multi-block merges)

6. **Cleanup:** Remove stored link mark so next typed char isn't linked

## Helper Functions Needed

### `isInlineSelection(state): boolean`
Check if current selection is non-empty and doesn't cross block boundaries.

```typescript
function isInlineSelection(state: EditorState): boolean {
  const { from, to, $from, $to } = state.selection;
  if (from === to) return false; // empty selection
  // Same parent block = inline selection
  return $from.sameParent($to);
}
```

### `addLinkMarkToFragment(fragment, mark, schema): Fragment`
Recursively add a link mark to all text nodes in a fragment.

```typescript
function addLinkMarkToFragment(fragment: Fragment, mark: Mark): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      nodes.push(node.mark(mark.addToSet(node.marks)));
    } else if (node.content.size > 0) {
      nodes.push(node.copy(addLinkMarkToFragment(node.content, mark)));
    } else {
      nodes.push(node);
    }
  });
  return Fragment.from(nodes);
}
```

## Refactored Paste Handler Logic

```typescript
// 1. Detect URL and extract href
const sliceText = slice.content.textBetween(0, slice.content.size, "", "").trim();

let href: string | null = null;

// Check for plain text URL
const plainUrl = parseHttpUrl(sliceText);
if (plainUrl) {
  href = plainUrl.href;
} else {
  // Check for autolink (link mark where href === text)
  let linkHref: string | null = null;
  slice.content.descendants((node) => {
    const linkMark = node.marks?.find((m) => m.type === schema.marks.link);
    if (linkMark) {
      linkHref = linkMark.attrs.href;
      return false;
    }
  });
  if (linkHref && linkHref === sliceText) {
    href = linkHref;
  }
}

if (!href) {
  // Not a URL paste, fall through
  // ... rest of paste handler
}

// 2. Determine link text content
const { state, dispatch } = view;
const { selection } = state;
const linkMark = schema.marks.link.create({ href });

let linkSlice: Slice;

if (selection.empty || !isInlineSelection(state)) {
  // Empty or multi-block: link text = href
  const linkNode = schema.text(href, [linkMark]);
  linkSlice = new Slice(Fragment.from(linkNode), 0, 0);
} else {
  // Inline selection: link text = selected content with link mark added
  const { from, to } = selection;
  const selectedSlice = state.doc.slice(from, to);
  const linkedContent = addLinkMarkToFragment(selectedSlice.content, linkMark);
  linkSlice = new Slice(linkedContent, selectedSlice.openStart, selectedSlice.openEnd);
}

// 3. Paste
const tr = state.tr.replaceSelection(linkSlice);
tr.removeStoredMark(schema.marks.link);
dispatch(tr);
return true;
```

## What Gets Removed

- The `hasLinkMark` check that skipped autolinks entirely
- The separate Part 1 / Part 2 code paths
- The "Case 2b" link extension logic (selecting inside existing link)

## Behavior Changes

| Scenario | Old Behavior | New Behavior |
|----------|--------------|--------------|
| Paste `<a href="http://x.com">http://x.com</a>` (autolink) with empty selection | Pasted as-is (link preserved) | Same - pasted as link |
| Paste `<a href="http://x.com">http://x.com</a>` with inline selection "click" | Fell through to default paste (replaced "click" with the link) | "click" becomes link to x.com |
| Paste `<a href="http://foo.com">http://bar.com</a>` (text≠href) | Fell through to default | Falls through (not an autolink) |
| Paste plain URL with selection inside existing link | Extended to full link, replaced href | Just replaces selection (simpler) |

## Questions

1. Is dropping the "Case 2b" link extension logic okay? (It was for when selection is inside an existing link - it extended to cover the whole link before replacing href)

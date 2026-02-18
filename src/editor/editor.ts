import {
  baseKeymap,
  setBlockType,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  Fragment,
  type Mark,
  Node,
  type NodeType,
  Slice,
} from "prosemirror-model";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import {
  EditorState,
  NodeSelection,
  Plugin,
  Selection,
  type Transaction,
} from "prosemirror-state";
import { tableEditing } from "prosemirror-tables";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { isAllowedImageType } from "../storage/image";
import { getImageManager } from "./ImageManager";
import { createImageNodeView } from "./imageNodeView";
import { categorizeImageSrc, type ImageSrcType } from "./imageUtils";
import { createMathDisplayNodeView } from "./mathNodeView";
import { createMathPlugin } from "./mathPlugin";
import { parseHttpUrl, schema } from "./schema";
import { normalizeTablesInSlice } from "./tableNormalize";

// Re-export for backward compatibility
export { categorizeImageSrc, type ImageSrcType };

/**
 * Check if current selection is non-empty and inline (doesn't cross block boundaries).
 */
function isInlineSelection(state: EditorState): boolean {
  const { from, to, $from, $to } = state.selection;
  if (from === to) return false; // empty selection
  // Same parent block = inline selection
  return $from.sameParent($to);
}

/**
 * Add a mark to all nodes in a fragment of inline content.
 * Works for both text nodes and inline atoms (like images).
 */
function addMarkToFragment(fragment: Fragment, mark: Mark): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    nodes.push(node.mark(mark.addToSet(node.marks)));
  });
  return Fragment.from(nodes);
}

interface ImageToProcess {
  node: Node;
  src: string;
  srcType: ImageSrcType;
}

/**
 * Replace an image's src attribute in the document.
 * Used to update placeholders after async fetch completes.
 * Returns true if a replacement was made.
 */
export function replaceImageSrc(
  view: EditorView,
  oldSrc: string,
  newSrc: string,
): boolean {
  const { doc, tr } = view.state;
  let updated = false;

  doc.descendants((node, pos) => {
    if (node.type.name === "image" && node.attrs.src === oldSrc) {
      tr.setNodeMarkup(pos, null, {
        ...node.attrs,
        src: newSrc,
      });
      updated = true;
    }
    return !updated; // Stop traversal after first match
  });

  if (updated) {
    view.dispatch(tr);
  }

  return updated;
}

/** Find all images in a slice that need processing (remote or data URLs) */
function findImagesToProcess(slice: Slice): ImageToProcess[] {
  const images: ImageToProcess[] = [];

  function walkFragment(fragment: Fragment) {
    fragment.forEach((node) => {
      if (node.type.name === "image") {
        const src = node.attrs.src as string;
        const srcType = categorizeImageSrc(src);
        if (srcType === "remote" || srcType === "data") {
          images.push({ node, src, srcType });
        }
      }
      if (node.content.size > 0) {
        walkFragment(node.content);
      }
    });
  }

  walkFragment(slice.content);
  return images;
}

/** Transform a slice by replacing image src attributes */
function transformSliceImages(
  slice: Slice,
  srcMap: Map<string, string>,
): Slice {
  function transformFragment(fragment: Fragment): Fragment {
    const nodes: Node[] = [];
    fragment.forEach((node) => {
      if (node.type.name === "image") {
        const oldSrc = node.attrs.src as string;
        const newSrc = srcMap.get(oldSrc);
        if (newSrc !== undefined) {
          nodes.push(
            node.type.create({ ...node.attrs, src: newSrc }, node.content),
          );
        } else {
          nodes.push(node);
        }
      } else if (node.content.size > 0) {
        nodes.push(
          node.type.create(
            node.attrs,
            transformFragment(node.content),
            node.marks,
          ),
        );
      } else {
        nodes.push(node);
      }
    });
    return Fragment.from(nodes);
  }

  return new Slice(
    transformFragment(slice.content),
    slice.openStart,
    slice.openEnd,
  );
}

const markKeymap = keymap({
  "Mod-b": toggleMark(schema.marks.strong),
  "Mod-i": toggleMark(schema.marks.em),
  "Mod-`": toggleMark(schema.marks.code),
  "Mod-Shift-`": toggleMark(schema.marks.strikethrough),
});

// Tab navigation from title to first block (skipping created timestamp)
function tabNavigation(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
) {
  const { $from } = state.selection;
  const grandparent = $from.node($from.depth - 1);

  // Check if we're in title (direct child of doc at index 0)
  if (grandparent === state.doc) {
    const pos = $from.before($from.depth);
    const nodeIndex = state.doc.resolve(pos).index();

    // If in title (index 0), move to first block (index 2, skipping created at index 1)
    if (nodeIndex === 0 && state.doc.childCount > 2) {
      if (dispatch) {
        // Calculate position of first block (after title and created)
        const targetPos =
          state.doc.child(0).nodeSize + state.doc.child(1).nodeSize;
        const tr = state.tr.setSelection(
          Selection.near(state.doc.resolve(targetPos + 1)),
        );
        dispatch(tr);
      }
      return true;
    }
  }
  return false;
}

// Shift-Tab navigation from first block back to title
function shiftTabNavigation(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
) {
  const { $from } = state.selection;
  const grandparent = $from.node($from.depth - 1);

  // Check if we're in a block (direct child of doc, index >= 2)
  if (grandparent === state.doc) {
    const pos = $from.before($from.depth);
    const nodeIndex = state.doc.resolve(pos).index();

    // If in first block (index 2) or later, move to title (index 0)
    if (nodeIndex >= 2) {
      if (dispatch) {
        // Position inside title (after opening tag)
        const tr = state.tr.setSelection(Selection.near(state.doc.resolve(1)));
        dispatch(tr);
      }
      return true;
    }
  }
  return false;
}

const navigationKeymap = keymap({
  Tab: tabNavigation,
  "Shift-Tab": shiftTabNavigation,
});

// List keymap - Enter splits list items, Tab/Shift-Tab indent/unindent
// These commands return false if not in a list, allowing fallback to navigation
const listKeymap = keymap({
  Enter: splitListItem(schema.nodes.list_item),
  Tab: sinkListItem(schema.nodes.list_item),
  "Shift-Tab": liftListItem(schema.nodes.list_item),
});

// Placeholder plugin for empty title
const placeholderPlugin = new Plugin({
  props: {
    decorations(state) {
      const decorations: Decoration[] = [];
      const { doc } = state;

      // Check title (first child)
      const title = doc.child(0);
      if (title.type.name === "title" && title.content.size === 0) {
        decorations.push(
          Decoration.node(0, title.nodeSize, {
            class: "placeholder",
            "data-placeholder": "Title",
          }),
        );
      }

      return DecorationSet.create(doc, decorations);
    },
  },
});

const plugins = [
  history(),
  markKeymap,
  tableEditing(), // Table editing (Tab navigation, row length fixes) - before listKeymap
  listKeymap,
  navigationKeymap,
  placeholderPlugin,
  createMathPlugin(), // Math editing popover
  keymap(baseKeymap),
];

// Change listeners per view
const changeListeners = new WeakMap<EditorView, () => void>();

// Selection change listeners per view
const selectionListeners = new WeakMap<EditorView, () => void>();

/**
 * Insert a slice into the document, handling block vs inline content.
 * Used after transforming images in pasted HTML.
 */
function insertSlice(view: EditorView, slice: Slice): void {
  const { state } = view;

  // Check if slice contains block-level nodes
  let hasBlockContent = false;
  slice.content.forEach((node) => {
    if (node.isBlock) hasBlockContent = true;
  });

  if (!hasBlockContent) {
    // Just insert inline content
    const tr = state.tr;
    tr.replaceSelection(slice);
    view.dispatch(tr);
    return;
  }

  // Transform title nodes to section level 1 for body paste
  const transformedNodes: Node[] = [];
  slice.content.forEach((node) => {
    if (node.type.name === "title") {
      transformedNodes.push(
        schema.nodes.section.create({ level: 1 }, node.content),
      );
    } else {
      transformedNodes.push(node);
    }
  });

  const tr = state.tr;
  const { $from } = state.selection;
  const currentBlock = $from.node(1);
  const beforeBlock = $from.before(1);
  const afterBlock = $from.after(1);

  if (currentBlock.content.size === 0) {
    tr.replaceWith(beforeBlock, afterBlock, transformedNodes);
  } else {
    tr.insert(afterBlock, transformedNodes);
  }

  const insertEnd = tr.mapping.map(afterBlock);
  tr.setSelection(Selection.near(tr.doc.resolve(insertEnd)));
  view.dispatch(tr);
}

export function mountEditor(host: HTMLElement): EditorView {
  // Create initial document with current timestamp
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.title.create(),
    schema.nodes.created.create({ timestamp: Date.now() }),
    schema.nodes.paragraph.create(),
  ]);
  const state = EditorState.create({ schema, plugins, doc });

  const view = new EditorView(host, {
    state,
    nodeViews: {
      image: createImageNodeView,
      math_display: createMathDisplayNodeView,
    },
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr);
      view.updateState(newState);

      if (tr.docChanged) {
        const listener = changeListeners.get(view);
        if (listener) listener();
      }

      if (tr.selectionSet || tr.docChanged) {
        const listener = selectionListeners.get(view);
        if (listener) listener();
      }
    },
    handlePaste(view, event, slice) {
      const manager = getImageManager(view);
      const files = event.clipboardData?.files;

      // Check for image files first
      if (files && files.length > 0) {
        const imageFiles: File[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith("image/") && isAllowedImageType(file.type)) {
            imageFiles.push(file);
          }
        }

        if (imageFiles.length > 0) {
          if (!manager) {
            console.warn("No ImageManager available");
            return false;
          }

          // Process images asynchronously
          Promise.all(
            imageFiles.map(async (file) => {
              const result = await manager.ingest({ type: "file", file });
              return schema.nodes.image.create({
                src: result.relativePath,
                alt: file.name,
              });
            }),
          ).then((imageNodes) => {
            const tr = view.state.tr;
            for (const node of imageNodes) {
              tr.replaceSelectionWith(node);
            }
            view.dispatch(tr);
          });

          return true; // Consume the paste event
        }
      }

      // URL autolink: If pasted content is a URL (plain text or autolink where
      // href equals text), create a link. The link text is either the URL itself
      // (for empty/multi-block selection) or the selected text (for inline selection).
      const sliceText = slice.content
        .textBetween(0, slice.content.size, "", "")
        .trim();

      // Detect URL: either plain text URL or autolink (link mark where href === text)
      let href: string | null = null;
      const plainUrl = parseHttpUrl(sliceText);
      if (plainUrl) {
        href = plainUrl.href;
      } else {
        // Check for autolink from another app (link mark where href === text)
        let linkHref: string | null = null;
        slice.content.descendants((node) => {
          const linkMark = node.marks?.find(
            (m) => m.type === schema.marks.link,
          );
          if (linkMark) {
            linkHref = linkMark.attrs.href as string;
            return false; // stop iteration
          }
        });
        if (linkHref && linkHref === sliceText) {
          href = linkHref;
        }
      }

      if (href) {
        const { state, dispatch } = view;
        const { selection } = state;
        const linkMark = schema.marks.link.create({ href });

        let linkSlice: Slice;
        if (!selection.empty && isInlineSelection(state)) {
          // Inline selection: link text = selected content (preserving marks)
          const { from, to } = selection;
          const selectedSlice = state.doc.slice(from, to);
          const linkedContent = addMarkToFragment(
            selectedSlice.content,
            linkMark,
          );
          linkSlice = new Slice(
            linkedContent,
            selectedSlice.openStart,
            selectedSlice.openEnd,
          );
        } else {
          // Empty or multi-block selection: link text = href
          const linkNode = schema.text(href, [linkMark]);
          linkSlice = new Slice(Fragment.from(linkNode), 0, 0);
        }

        const tr = state.tr.replaceSelection(linkSlice);
        tr.removeStoredMark(schema.marks.link);
        dispatch(tr);
        return true;
      }

      // Normalize tables in pasted content to enforce GFM semantics
      // (flatten spanning cells, ensure first row is header cells)
      slice = normalizeTablesInSlice(slice, schema);

      // Check for images in HTML content that need processing
      const imagesToProcess = findImagesToProcess(slice);
      if (imagesToProcess.length > 0 && manager) {
        // Separate by type: data URLs (fast) vs remote/blob URLs (slow)
        const fastImages = imagesToProcess.filter(
          (img) => img.srcType === "data",
        );
        const slowImages = imagesToProcess.filter(
          (img) => img.srcType === "remote" || img.srcType === "blob",
        );

        const srcMap = new Map<string, string>();

        // Handle slow images: insert placeholder, fetch in background
        for (const img of slowImages) {
          const placeholderSrc = `placeholder:loading-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          srcMap.set(img.src, placeholderSrc);

          // Determine source type for ImageManager
          const source =
            img.srcType === "blob"
              ? { type: "remoteUrl" as const, url: img.src } // Blob URLs can be fetched
              : { type: "remoteUrl" as const, url: img.src };

          manager
            .ingest(source)
            .then((result) => {
              replaceImageSrc(view, placeholderSrc, result.relativePath);
            })
            .catch((err) => {
              console.error("Failed to fetch image:", img.src, err);
              replaceImageSrc(view, placeholderSrc, "placeholder:failed");
            });
        }

        // Handle fast images: process immediately
        const fastPromises = fastImages.map(async (img) => {
          try {
            const result = await manager.ingest({
              type: "dataUrl",
              dataUrl: img.src,
            });
            srcMap.set(img.src, result.relativePath);
          } catch (err) {
            console.error("Failed to save data URL image:", err);
            srcMap.set(img.src, "placeholder:failed");
          }
        });

        // Wait for fast images, then insert transformed slice
        Promise.all(fastPromises).then(() => {
          const transformedSlice = transformSliceImages(slice, srcMap);
          insertSlice(view, transformedSlice);
        });

        return true; // Consume the paste event
      }

      // Check if slice contains block-level nodes
      let hasBlockContent = false;
      slice.content.forEach((node) => {
        if (node.isBlock) hasBlockContent = true;
      });

      if (!hasBlockContent) {
        return false; // Inline content - use default handling
      }

      const { state, dispatch } = view;
      const { $from } = state.selection;
      const docIndex = $from.index(0);

      // Pasting into title - extract inline content only, filtering out images
      if (docIndex === 0) {
        // Collect all inline content from pasted blocks, excluding images
        const inlineNodes: Node[] = [];
        slice.content.forEach((node) => {
          if (node.isBlock) {
            // Extract inline content from blocks
            node.content.forEach((child) => {
              if (child.type.name !== "image") {
                inlineNodes.push(child);
              }
            });
          } else if (node.type.name !== "image") {
            inlineNodes.push(node);
          }
        });

        if (inlineNodes.length === 0) {
          return false;
        }

        const tr = state.tr;
        tr.replaceSelection(new Slice(Fragment.from(inlineNodes), 0, 0));
        dispatch(tr);
        return true;
      }

      // In created node - don't allow paste
      if (docIndex === 1) {
        return true; // Consume the event but do nothing
      }

      // Pasting into body - transform title nodes to section level 1
      const transformedNodes: Node[] = [];
      slice.content.forEach((node) => {
        if (node.type.name === "title") {
          // Convert to section level 1, preserving inline content
          transformedNodes.push(
            schema.nodes.section.create({ level: 1 }, node.content),
          );
        } else {
          transformedNodes.push(node);
        }
      });

      // Only handle collapsed selection for now
      if (!state.selection.empty) {
        return false;
      }

      const tr = state.tr;
      const currentBlock = $from.node(1);
      const beforeBlock = $from.before(1);
      const afterBlock = $from.after(1);

      if (currentBlock.content.size === 0) {
        // Empty block - replace it with pasted content
        tr.replaceWith(beforeBlock, afterBlock, transformedNodes);
      } else {
        // Non-empty block - insert pasted content after it
        tr.insert(afterBlock, transformedNodes);
      }

      // Move cursor to end of inserted content
      const insertEnd = tr.mapping.map(afterBlock);
      tr.setSelection(Selection.near(tr.doc.resolve(insertEnd)));

      dispatch(tr);
      return true;
    },
  });
  return view;
}

export function setContent(view: EditorView, content: unknown): void {
  let doc: Node;
  if (content) {
    doc = Node.fromJSON(schema, content);
  } else {
    // Create new document with current timestamp
    doc = schema.nodes.doc.create(null, [
      schema.nodes.title.create(),
      schema.nodes.created.create({ timestamp: Date.now() }),
      schema.nodes.paragraph.create(),
    ]);
  }
  const state = EditorState.create({ schema, plugins, doc });
  view.updateState(state);
}

export function onChange(view: EditorView, callback: () => void): void {
  changeListeners.set(view, callback);
}

export function focusAtEnd(view: EditorView): void {
  const end = view.state.doc.content.size;
  view.dispatch(
    view.state.tr.setSelection(Selection.near(view.state.doc.resolve(end))),
  );
  view.focus();
}

export function doUndo(view: EditorView): boolean {
  return undo(view.state, view.dispatch);
}

export function doRedo(view: EditorView): boolean {
  return redo(view.state, view.dispatch);
}

// Block type commands
export function setParagraph(view: EditorView): boolean {
  return setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
}

export function setSection(view: EditorView, level: number): boolean {
  return setBlockType(schema.nodes.section, { level })(
    view.state,
    view.dispatch,
  );
}

export function setCodeBlock(view: EditorView): boolean {
  return setBlockType(schema.nodes.code_block)(view.state, view.dispatch);
}

export function setBlockquote(view: EditorView): boolean {
  return wrapIn(schema.nodes.blockquote)(view.state, view.dispatch);
}

function isInList(state: EditorState, listType: NodeType): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === listType) return true;
  }
  return false;
}

export function toggleBulletList(view: EditorView): boolean {
  const { state, dispatch } = view;
  const { bullet_list, list_item } = schema.nodes;

  // If already in a bullet list, lift out
  if (isInList(state, bullet_list)) {
    return liftListItem(list_item)(state, dispatch);
  }
  return wrapInList(bullet_list)(state, dispatch);
}

export function toggleOrderedList(view: EditorView): boolean {
  const { state, dispatch } = view;
  const { ordered_list, list_item } = schema.nodes;

  // If already in an ordered list, lift out
  if (isInList(state, ordered_list)) {
    return liftListItem(list_item)(state, dispatch);
  }
  return wrapInList(ordered_list)(state, dispatch);
}

export function insertHorizontalRule(view: EditorView): boolean {
  const { state, dispatch } = view;
  const hr = schema.nodes.horizontal_rule.create();
  dispatch(state.tr.replaceSelectionWith(hr));
  return true;
}

export function insertMathDisplay(view: EditorView): boolean {
  const { state, dispatch } = view;
  const { $from } = state.selection;

  // Find the position after the current block
  const afterBlock = $from.after(1);

  // Create the math node
  const mathNode = schema.nodes.math_display.create({ content: "" });

  // Insert after current block
  const tr = state.tr.insert(afterBlock, mathNode);

  // Select the newly inserted math node
  // After insert, the math node is at position afterBlock
  tr.setSelection(NodeSelection.create(tr.doc, afterBlock));

  dispatch(tr);
  return true;
}

// Mark commands
export function toggleStrong(view: EditorView): boolean {
  return toggleMark(schema.marks.strong)(view.state, view.dispatch);
}

export function toggleEm(view: EditorView): boolean {
  return toggleMark(schema.marks.em)(view.state, view.dispatch);
}

export function toggleCode(view: EditorView): boolean {
  return toggleMark(schema.marks.code)(view.state, view.dispatch);
}

export function toggleStrikethrough(view: EditorView): boolean {
  return toggleMark(schema.marks.strikethrough)(view.state, view.dispatch);
}

export function toggleLink(view: EditorView, href: string): boolean {
  return toggleMark(schema.marks.link, { href })(view.state, view.dispatch);
}

export function onSelectionChange(
  view: EditorView,
  callback: () => void,
): void {
  selectionListeners.set(view, callback);
}

export function getBlockTypeName(view: EditorView): string {
  const { $from } = view.state.selection;

  // Find the block node containing the cursor
  // Walk up from the cursor to find the nearest block-level node
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    const typeName = node.type.name;

    switch (typeName) {
      case "title":
        return "Title";
      case "paragraph":
        return "Paragraph";
      case "section": {
        const level = node.attrs.level as number;
        if (level === 1) return "Section";
        if (level === 2) return "Subsection";
        if (level === 3) return "Subsubsection";
        if (level === 4) return "Subsubsubsection";
        return `Section ${level}`;
      }
      case "code_block":
        return "Code Block";
      case "blockquote":
        return "Block Quote";
      case "horizontal_rule":
        return "Horizontal Rule";
      case "created":
        return "Created";
      case "bullet_list":
        return "Bullet List";
      case "ordered_list":
        return "Ordered List";
      case "list_item":
        return "List Item";
    }
  }

  return "";
}

export function isInsideBlockquote(view: EditorView): boolean {
  const { $from } = view.state.selection;

  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === "blockquote") {
      return true;
    }
  }
  return false;
}

export function isInsideBulletList(view: EditorView): boolean {
  const { $from } = view.state.selection;

  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === "bullet_list") {
      return true;
    }
  }
  return false;
}

export function isInsideOrderedList(view: EditorView): boolean {
  const { $from } = view.state.selection;

  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === "ordered_list") {
      return true;
    }
  }
  return false;
}

export function isImageSelected(view: EditorView): boolean {
  const { selection } = view.state;
  if (selection instanceof NodeSelection) {
    return selection.node.type.name === "image";
  }
  return false;
}

export interface ActiveMarks {
  strong: boolean;
  em: boolean;
  code: boolean;
  strikethrough: boolean;
  link: boolean;
}

export function getActiveMarks(view: EditorView): ActiveMarks {
  const { state } = view;
  const { from, $from, to, empty } = state.selection;

  const result: ActiveMarks = {
    strong: false,
    em: false,
    code: false,
    strikethrough: false,
    link: false,
  };

  if (empty) {
    // Cursor position (no selection) - check stored marks or marks at position
    const storedMarks = state.storedMarks;
    const marks = storedMarks || $from.marks();

    for (const mark of marks) {
      if (mark.type === schema.marks.strong) result.strong = true;
      if (mark.type === schema.marks.em) result.em = true;
      if (mark.type === schema.marks.code) result.code = true;
      if (mark.type === schema.marks.strikethrough) result.strikethrough = true;
      if (mark.type === schema.marks.link) result.link = true;
    }
  } else {
    // Selection range - check if mark exists anywhere in the selection
    state.doc.nodesBetween(from, to, (node) => {
      if (node.isText && node.marks) {
        for (const mark of node.marks) {
          if (mark.type === schema.marks.strong) result.strong = true;
          if (mark.type === schema.marks.em) result.em = true;
          if (mark.type === schema.marks.code) result.code = true;
          if (mark.type === schema.marks.strikethrough)
            result.strikethrough = true;
          if (mark.type === schema.marks.link) result.link = true;
        }
      }
    });
  }

  return result;
}

/**
 * Set up copy interception for a view.
 * Handles two cases:
 * 1. Single image selected: writes image data to clipboard (for image editors like GIMP)
 * 2. Rich text with images: replaces relative paths with data URLs for portability
 */
export function setupCopyHandler(view: EditorView): () => void {
  const handler = async (event: ClipboardEvent) => {
    if (!view.hasFocus()) return;

    const manager = getImageManager(view);
    if (!manager) return;

    const { selection } = view.state;

    // Case A: Single image selected (NodeSelection)
    if (
      selection instanceof NodeSelection &&
      selection.node.type.name === "image"
    ) {
      const { src, alt, title } = selection.node.attrs as {
        src: string;
        alt: string | null;
        title: string | null;
      };

      // Only handle relative paths (our locally stored images)
      if (categorizeImageSrc(src) !== "relative") return;

      const blob = manager.getBlob(src);
      if (!blob) return;

      event.preventDefault();

      try {
        // Get data URL and convert blob to PNG for clipboard
        const [dataUrl, pngBlob] = await Promise.all([
          manager.getDataUrl(src),
          convertToPng(blob),
        ]);

        // Build img tag with all attributes (escape for HTML attributes)
        const escapeAttr = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        let imgHtml = `<img src="${dataUrl}"`;
        if (alt) imgHtml += ` alt="${escapeAttr(alt)}"`;
        if (title) imgHtml += ` title="${escapeAttr(title)}"`;
        imgHtml += ">";

        const clipboardItem = new ClipboardItem({
          "image/png": pngBlob,
          "text/html": new Blob([imgHtml], { type: "text/html" }),
        });
        await navigator.clipboard.write([clipboardItem]);
      } catch (err) {
        console.error("Failed to write image to clipboard:", err);
        alert("Failed to copy image to clipboard.");
      }
      return;
    }

    // Case B: Rich text with images - replace relative paths with data URLs
    const html = event.clipboardData?.getData("text/html");
    if (!html || !html.includes("<img")) return;

    // Find all relative image paths in the HTML
    const imgRegex = /<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi;
    const relativePaths: string[] = [];
    for (const match of html.matchAll(imgRegex)) {
      const src = match[2];
      if (categorizeImageSrc(src) === "relative") {
        relativePaths.push(src);
      }
    }

    if (relativePaths.length === 0) return;

    // IMPORTANT: Clipboard events are synchronous - we must preventDefault and
    // capture all data BEFORE any async work. Then use navigator.clipboard.write().
    event.preventDefault();
    const plainText = event.clipboardData?.getData("text/plain") || "";

    try {
      // Fetch all data URLs in parallel
      const dataUrlMap = new Map<string, string>();
      await Promise.all(
        relativePaths.map(async (src) => {
          try {
            const dataUrl = await manager.getDataUrl(src);
            dataUrlMap.set(src, dataUrl);
          } catch (err) {
            console.error("Failed to get data URL for:", src, err);
          }
        }),
      );

      // Replace relative paths with data URLs
      const processed = html.replace(
        /<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi,
        (_match, before, src, after) => {
          const dataUrl = dataUrlMap.get(src);
          if (dataUrl) {
            return `<img${before} src="${dataUrl}"${after}>`;
          }
          return _match;
        },
      );

      // Write to clipboard using async API
      const items: Record<string, Blob> = {
        "text/html": new Blob([processed], { type: "text/html" }),
      };
      if (plainText) {
        items["text/plain"] = new Blob([plainText], { type: "text/plain" });
      }
      await navigator.clipboard.write([new ClipboardItem(items)]);
    } catch (err) {
      console.error("Failed to write to clipboard:", err);
      alert("Failed to copy to clipboard.");
    }
  };

  document.addEventListener("copy", handler);

  // Return cleanup function
  return () => {
    document.removeEventListener("copy", handler);
  };
}

/** Convert any image blob to PNG (Clipboard API only supports PNG) */
async function convertToPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") {
    return blob;
  }

  const img = new Image();
  const blobUrl = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = blobUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    ctx.drawImage(img, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error("Failed to convert to PNG"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

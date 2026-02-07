import {
  baseKeymap,
  setBlockType,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Fragment, Node, type NodeType, Slice } from "prosemirror-model";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import {
  EditorState,
  Plugin,
  Selection,
  type Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { schema } from "./schema";

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
  listKeymap,
  navigationKeymap,
  placeholderPlugin,
  keymap(baseKeymap),
];

// Change listeners per view
const changeListeners = new WeakMap<EditorView, () => void>();

// Selection change listeners per view
const selectionListeners = new WeakMap<EditorView, () => void>();

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
    dispatchTransaction(tr) {
      if (tr.getMeta("uiEvent") === "paste") {
        console.log("Paste transaction steps:", tr.steps);
        console.log("Doc before:", tr.before.toString());
        console.log("Doc after:", tr.doc.toString());
      }
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
    transformPasted(slice) {
      console.log("Pasted slice:", slice.content.toString());
      console.log("Slice nodes:", slice.content);
      return slice;
    },
    handlePaste(view, _event, slice) {
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

      // Pasting into title - extract inline content only
      if (docIndex === 0) {
        // Collect all inline content from pasted blocks
        const inlineNodes: Node[] = [];
        slice.content.forEach((node) => {
          if (node.isBlock) {
            // Extract inline content from blocks
            node.content.forEach((child) => {
              inlineNodes.push(child);
            });
          } else {
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

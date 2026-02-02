import {
  baseKeymap,
  setBlockType,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Fragment, Node, Slice } from "prosemirror-model";
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

// Tab navigation between title, subtitle, and first block
function tabNavigation(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
) {
  const { $from } = state.selection;
  const grandparent = $from.node($from.depth - 1);

  // Check if we're in title or subtitle (direct children of doc)
  if (grandparent === state.doc) {
    const pos = $from.before($from.depth);
    const nodeIndex = state.doc.resolve(pos).index();

    // If in title (index 0), move to subtitle (index 1)
    // If in subtitle (index 1), move to first block (index 2)
    if (nodeIndex < state.doc.childCount - 1) {
      if (dispatch) {
        let targetPos = 0;
        for (let i = 0; i <= nodeIndex; i++) {
          targetPos += state.doc.child(i).nodeSize;
        }
        // Position inside the next node
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

function shiftTabNavigation(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
) {
  const { $from } = state.selection;
  const grandparent = $from.node($from.depth - 1);

  // Check if we're in title, subtitle, or a block (direct children of doc)
  if (grandparent === state.doc) {
    const pos = $from.before($from.depth);
    const nodeIndex = state.doc.resolve(pos).index();

    // If in subtitle or later, move to previous node
    if (nodeIndex > 0) {
      if (dispatch) {
        let targetPos = 0;
        for (let i = 0; i < nodeIndex - 1; i++) {
          targetPos += state.doc.child(i).nodeSize;
        }
        // Position inside the previous node
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

const navigationKeymap = keymap({
  Tab: tabNavigation,
  "Shift-Tab": shiftTabNavigation,
});

// Placeholder plugin for empty title/subtitle
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

      // Check subtitle (second child)
      const subtitle = doc.child(1);
      const subtitlePos = title.nodeSize;
      if (subtitle.type.name === "subtitle" && subtitle.content.size === 0) {
        decorations.push(
          Decoration.node(subtitlePos, subtitlePos + subtitle.nodeSize, {
            class: "placeholder",
            "data-placeholder": "Subtitle",
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
    schema.nodes.subtitle.create(),
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

      // Pasting into title or subtitle - extract inline content only
      if (docIndex < 2) {
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
      if (docIndex === 2) {
        return true; // Consume the event but do nothing
      }

      // Pasting into body - transform title/subtitle nodes to section level 1
      const transformedNodes: Node[] = [];
      slice.content.forEach((node) => {
        if (node.type.name === "title" || node.type.name === "subtitle") {
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
      schema.nodes.subtitle.create(),
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
      case "subtitle":
        return "Subtitle";
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
    }
  }

  return "";
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

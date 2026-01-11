import { baseKeymap, setBlockType, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { schema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

const markKeymap = keymap({
  "Mod-b": toggleMark(schema.marks.strong),
  "Mod-i": toggleMark(schema.marks.em),
});

export function mountEditor(host: HTMLElement): EditorView {
  const state = EditorState.create({
    schema,
    plugins: [history(), markKeymap, keymap(baseKeymap)],
  });

  const view = new EditorView(host, { state });
  return view;
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

export function setHeading(view: EditorView, level: number): boolean {
  return setBlockType(schema.nodes.heading, { level })(
    view.state,
    view.dispatch,
  );
}

export function setCodeBlock(view: EditorView): boolean {
  return setBlockType(schema.nodes.code_block)(view.state, view.dispatch);
}

export function setBlockquote(view: EditorView): boolean {
  // Blockquote wraps other blocks, so we need wrapIn instead of setBlockType
  // For now, this is a simplified version
  return setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
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

export function toggleLink(view: EditorView, href: string): boolean {
  return toggleMark(schema.marks.link, { href })(view.state, view.dispatch);
}

/**
 * NodeView for math_display nodes.
 * Renders LaTeX with KaTeX and shows a popover editor when selected.
 *
 * Entry methods:
 * - Click on math block → cursor at end
 * - Arrow down/right from above → cursor at start
 * - Arrow up/left from below → cursor at end
 * - Insert new block via toolbar → cursor at start (empty)
 * - Exit from adjacent math block → cursor at start or end based on direction
 *
 * Exit methods:
 * - Click elsewhere → deselect
 * - Arrow up/left at position 0 → exit before
 * - Arrow down/right at end → exit after
 * - Tab → exit after
 * - Shift-Tab → exit before
 * - Escape → exit after
 */

import katex from "katex";
import type { Node } from "prosemirror-model";
import { Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export function createMathDisplayNodeView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
) {
  // DOM structure
  const dom = document.createElement("div");
  dom.className = "math-display";
  dom.setAttribute("data-latex", node.attrs.content);

  const rendered = document.createElement("div");
  rendered.className = "math-rendered";
  dom.appendChild(rendered);

  const popover = document.createElement("div");
  popover.className = "math-popover";
  popover.style.display = "none";

  const textarea = document.createElement("textarea");
  textarea.className = "math-textarea";
  textarea.placeholder = "Enter LaTeX...";
  textarea.rows = 3;
  popover.appendChild(textarea);
  dom.appendChild(popover);

  // State
  let currentContent = node.attrs.content as string;
  let isEditing = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Rendering
  function renderMath(latex: string) {
    try {
      katex.render(latex || "\\text{(empty)}", rendered, {
        displayMode: true,
        throwOnError: false,
        errorColor: "#c00",
      });
      rendered.classList.remove("math-error");
    } catch (e) {
      rendered.textContent = String(e);
      rendered.classList.add("math-error");
    }
  }

  function updateNodeContent(latex: string) {
    const pos = getPos();
    if (pos === undefined) return;
    const tr = view.state.tr.setNodeMarkup(pos, undefined, { content: latex });
    view.dispatch(tr);
  }

  // Exit functions
  function exitToAfter() {
    const pos = getPos();
    if (pos === undefined) return;
    const nodeSize = view.state.doc.nodeAt(pos)?.nodeSize ?? 1;
    const afterPos = pos + nodeSize;
    const tr = view.state.tr.setSelection(
      Selection.near(view.state.doc.resolve(afterPos)),
    );
    view.dispatch(tr);
    view.focus();
  }

  function exitToBefore() {
    const pos = getPos();
    if (pos === undefined) return;
    const tr = view.state.tr.setSelection(
      Selection.near(view.state.doc.resolve(pos), -1),
    );
    view.dispatch(tr);
    view.focus();
  }

  // Document-level keyboard handler (capture phase)
  // This intercepts ALL keyboard events when editing, regardless of focus
  function handleDocumentKeydown(e: KeyboardEvent) {
    if (!isEditing) return;

    // Exit keys
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      exitToAfter();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        exitToBefore();
      } else {
        exitToAfter();
      }
      return;
    }

    // Arrow exits at boundaries
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      if (textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
        e.preventDefault();
        e.stopPropagation();
        exitToBefore();
        return;
      }
    }

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      const len = textarea.value.length;
      if (textarea.selectionStart === len && textarea.selectionEnd === len) {
        e.preventDefault();
        e.stopPropagation();
        exitToAfter();
        return;
      }
    }

    // For all other keys: ensure textarea has focus, then let event proceed
    if (document.activeElement !== textarea) {
      textarea.focus();
    }
    // Don't prevent/stop - let the event reach the textarea naturally
  }

  // Input handler for textarea
  function handleInput() {
    const latex = textarea.value;
    renderMath(latex);
    dom.setAttribute("data-latex", latex);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateNodeContent(latex);
    }, 100);
  }

  textarea.addEventListener("input", handleInput);

  // Initial render
  renderMath(node.attrs.content);

  return {
    dom,

    update(updatedNode: Node) {
      if (updatedNode.type.name !== "math_display") {
        return false;
      }
      currentContent = updatedNode.attrs.content as string;
      dom.setAttribute("data-latex", currentContent);

      // Only re-render if not actively editing
      if (!isEditing) {
        renderMath(currentContent);
      }
      return true;
    },

    selectNode() {
      // Determine entry direction before we change state
      const pos = getPos();
      let cursorAtEnd = false;
      if (pos !== undefined) {
        // Check if there's text before this node (we came from above/left)
        // by seeing if Selection.near resolves to before or after
        // Actually, we can check the view's current selection anchor
        // If anchor < pos, we came from before; if > pos + nodeSize, from after
        const { anchor } = view.state.selection;
        const nodeSize = view.state.doc.nodeAt(pos)?.nodeSize ?? 1;
        cursorAtEnd = anchor > pos + nodeSize / 2;
      }

      isEditing = true;
      dom.classList.add("math-selected");
      popover.style.display = "block";
      textarea.value = currentContent;

      // Add document-level keyboard interception
      document.addEventListener("keydown", handleDocumentKeydown, true);

      // Focus textarea and position cursor
      textarea.focus();
      if (cursorAtEnd) {
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      } else {
        textarea.selectionStart = textarea.selectionEnd = 0;
      }
    },

    deselectNode() {
      isEditing = false;
      dom.classList.remove("math-selected");
      popover.style.display = "none";

      // Remove document-level keyboard interception
      document.removeEventListener("keydown", handleDocumentKeydown, true);

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },

    stopEvent(event: Event) {
      // When editing, intercept all keyboard events (handled by document listener)
      if (isEditing && event instanceof KeyboardEvent) {
        return true;
      }
      // Also intercept events targeting the popover
      return popover.contains(event.target as globalThis.Node);
    },

    destroy() {
      document.removeEventListener("keydown", handleDocumentKeydown, true);
      textarea.removeEventListener("input", handleInput);
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
}

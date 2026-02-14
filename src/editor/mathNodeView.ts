/**
 * NodeView for math_display nodes.
 * Renders LaTeX with KaTeX and shows a popover editor when selected.
 */

import katex from "katex";
import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

/**
 * NodeView for display math that renders with KaTeX and shows
 * a popover textarea when selected.
 */
export function createMathDisplayNodeView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
) {
  // Main container
  const dom = document.createElement("div");
  dom.className = "math-display";
  dom.setAttribute("data-latex", node.attrs.content);

  // Rendered math container
  const rendered = document.createElement("div");
  rendered.className = "math-rendered";
  dom.appendChild(rendered);

  // Popover for editing (hidden by default)
  const popover = document.createElement("div");
  popover.className = "math-popover";
  popover.style.display = "none";

  const textarea = document.createElement("textarea");
  textarea.className = "math-textarea";
  textarea.placeholder = "Enter LaTeX...";
  textarea.rows = 3;
  popover.appendChild(textarea);
  dom.appendChild(popover);

  // Debounce timer for live updates
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function renderMath(latex: string) {
    try {
      katex.render(latex || "\\text{(empty)}", rendered, {
        displayMode: true,
        throwOnError: false,
        errorColor: "#c00",
      });
      rendered.classList.remove("math-error");
    } catch (e) {
      // KaTeX with throwOnError: false handles most errors gracefully,
      // but we catch anything else just in case
      rendered.textContent = String(e);
      rendered.classList.add("math-error");
    }
  }

  function updateNodeContent(latex: string) {
    const pos = getPos();
    if (pos === undefined) return;

    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
      content: latex,
    });
    view.dispatch(tr);
  }

  function handleInput() {
    const latex = textarea.value;

    // Update rendered math immediately for visual feedback
    renderMath(latex);
    dom.setAttribute("data-latex", latex);

    // Debounce the actual node update
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateNodeContent(latex);
    }, 100);
  }

  function handleKeydown(e: KeyboardEvent) {
    // Escape closes the popover
    if (e.key === "Escape") {
      e.preventDefault();
      view.focus();
    }
  }

  textarea.addEventListener("input", handleInput);
  textarea.addEventListener("keydown", handleKeydown);

  // Initial render
  renderMath(node.attrs.content);

  return {
    dom,
    update(updatedNode: Node) {
      if (updatedNode.type.name !== "math_display") {
        return false;
      }
      const newContent = updatedNode.attrs.content;
      dom.setAttribute("data-latex", newContent);

      // Only re-render if content changed and we're not actively editing
      if (popover.style.display === "none") {
        renderMath(newContent);
      }
      return true;
    },
    selectNode() {
      dom.classList.add("math-selected");
      popover.style.display = "block";
      textarea.value = node.attrs.content;
      // Focus and select all for easy replacement
      textarea.focus();
      textarea.select();
    },
    deselectNode() {
      dom.classList.remove("math-selected");
      popover.style.display = "none";
      // Clear any pending debounce
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
    stopEvent(event: Event) {
      // Let the textarea handle its own events
      return popover.contains(event.target as globalThis.Node);
    },
    destroy() {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("keydown", handleKeydown);
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
}

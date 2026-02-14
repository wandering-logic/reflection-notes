/**
 * NodeView for math_display nodes.
 *
 * This is a simplified view that just renders LaTeX with KaTeX.
 * All editing logic (popover, keyboard handling) is in mathPlugin.ts.
 */

import katex from "katex";
import type { Node } from "prosemirror-model";

export function createMathDisplayNodeView(node: Node) {
  // DOM structure
  const dom = document.createElement("div");
  dom.className = "math-display";
  dom.setAttribute("data-latex", node.attrs.content as string);

  const rendered = document.createElement("div");
  rendered.className = "math-rendered";
  dom.appendChild(rendered);

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

  // Initial render
  renderMath(node.attrs.content as string);

  return {
    dom,

    update(updatedNode: Node) {
      if (updatedNode.type.name !== "math_display") {
        return false;
      }
      const content = updatedNode.attrs.content as string;
      dom.setAttribute("data-latex", content);
      renderMath(content);
      return true;
    },

    // No selectNode, deselectNode, stopEvent - plugin handles editing
  };
}

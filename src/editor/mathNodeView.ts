/**
 * NodeViews for math_display and math_inline nodes.
 *
 * These are simplified views that just render LaTeX with KaTeX.
 * All editing logic (popover, keyboard handling) is in mathPlugin.ts.
 */

import katex from "katex";
import type { Node } from "prosemirror-model";

function createMathNodeView(
  typeName: "math_display" | "math_inline",
  displayMode: boolean,
) {
  const className = typeName.replace("_", "-");
  const tag = displayMode ? "div" : "span";

  return (node: Node) => {
    const dom = document.createElement(tag);
    dom.className = className;
    dom.setAttribute("data-latex", node.attrs.content as string);

    const rendered = document.createElement(tag);
    rendered.className = "math-rendered";
    dom.appendChild(rendered);

    function renderMath(latex: string) {
      try {
        katex.render(latex || "\\text{(empty)}", rendered, {
          displayMode,
          throwOnError: false,
          errorColor: "#c00",
        });
        rendered.classList.remove("math-error");
      } catch (e) {
        rendered.textContent = String(e);
        rendered.classList.add("math-error");
      }
    }

    renderMath(node.attrs.content as string);

    return {
      dom,

      update(updatedNode: Node) {
        if (updatedNode.type.name !== typeName) return false;
        const content = updatedNode.attrs.content as string;
        if (content === dom.getAttribute("data-latex")) return true;
        dom.setAttribute("data-latex", content);
        renderMath(content);
        return true;
      },

      // No selectNode, deselectNode, stopEvent - plugin handles editing
    };
  };
}

export const createMathDisplayNodeView = createMathNodeView(
  "math_display",
  true,
);
export const createMathInlineNodeView = createMathNodeView(
  "math_inline",
  false,
);

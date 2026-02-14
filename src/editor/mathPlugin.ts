/**
 * Math editing plugin.
 *
 * This plugin manages a popover for editing math_display nodes.
 * The key insight: handleKeyDown runs BEFORE ProseMirror's default
 * handling, so we can intercept all keys when editing.
 *
 * Responsibilities:
 * - Show/hide popover based on NodeSelection state
 * - Intercept keyboard events when editing
 * - Update node content as user types
 * - Handle exit (Escape, Tab, arrows at boundary)
 */

import { NodeSelection, Plugin, PluginKey, Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export const mathPluginKey = new PluginKey<MathPluginState>("mathEdit");

interface MathPluginState {
  editingPos: number | null;
}

export function createMathPlugin(): Plugin<MathPluginState> {
  // DOM elements created once, reused
  let popover: HTMLDivElement | null = null;
  let textarea: HTMLTextAreaElement | null = null;
  let editorView: EditorView | null = null;

  // Current editing position (null when not editing)
  let editingPos: number | null = null;

  // Debounce timer for content updates
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function createPopoverDOM(): HTMLDivElement {
    const div = document.createElement("div");
    div.className = "math-popover";
    div.style.display = "none";

    const ta = document.createElement("textarea");
    ta.className = "math-textarea";
    ta.placeholder = "Enter LaTeX...";
    ta.rows = 3;
    div.appendChild(ta);

    // Handle input changes
    ta.addEventListener("input", () => {
      if (editingPos === null || !editorView) return;

      // Debounce updates to node
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updateNodeContent(ta.value);
      }, 100);
    });

    return div;
  }

  function updateNodeContent(latex: string): void {
    if (editingPos === null || !editorView) return;

    const { state } = editorView;
    const node = state.doc.nodeAt(editingPos);
    if (!node || node.type.name !== "math_display") return;

    const tr = state.tr.setNodeMarkup(editingPos, undefined, {
      content: latex,
    });
    editorView.dispatch(tr);
  }

  function showPopover(view: EditorView, pos: number, content: string): void {
    if (!popover || !textarea) return;

    editingPos = pos;

    // Position the popover near the math node
    const nodeDOM = view.nodeDOM(pos);
    if (nodeDOM instanceof HTMLElement) {
      const rect = nodeDOM.getBoundingClientRect();
      const editorRect = view.dom.getBoundingClientRect();

      popover.style.position = "absolute";
      popover.style.left = `${rect.left - editorRect.left}px`;
      popover.style.top = `${rect.bottom - editorRect.top + 4}px`;
      popover.style.display = "block";

      // Add selected class to the math node
      nodeDOM.classList.add("math-selected");
    }

    textarea.value = content;
    textarea.focus();
  }

  function hidePopover(): void {
    if (!popover || !editorView) return;

    // Remove selected class from all math nodes
    const selected = editorView.dom.querySelector(".math-selected");
    if (selected) {
      selected.classList.remove("math-selected");
    }

    popover.style.display = "none";

    // Flush any pending content update
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      if (textarea && editingPos !== null) {
        updateNodeContent(textarea.value);
      }
    }

    editingPos = null;
  }

  function exitToAfter(view: EditorView): void {
    if (editingPos === null) return;

    const node = view.state.doc.nodeAt(editingPos);
    if (!node) return;

    const afterPos = editingPos + node.nodeSize;
    const tr = view.state.tr.setSelection(
      Selection.near(view.state.doc.resolve(afterPos)),
    );
    view.dispatch(tr);
    view.focus();
  }

  function exitToBefore(view: EditorView): void {
    if (editingPos === null) return;

    const tr = view.state.tr.setSelection(
      Selection.near(view.state.doc.resolve(editingPos), -1),
    );
    view.dispatch(tr);
    view.focus();
  }

  return new Plugin<MathPluginState>({
    key: mathPluginKey,

    state: {
      init(): MathPluginState {
        return { editingPos: null };
      },
      apply(_tr, value): MathPluginState {
        return value;
      },
    },

    props: {
      handleKeyDown(view, event): boolean {
        // Only intercept when editing
        if (editingPos === null) return false;

        // Escape: exit after
        if (event.key === "Escape") {
          event.preventDefault();
          hidePopover();
          exitToAfter(view);
          return true;
        }

        // Tab: exit after (Shift-Tab: exit before)
        if (event.key === "Tab") {
          event.preventDefault();
          hidePopover();
          if (event.shiftKey) {
            exitToBefore(view);
          } else {
            exitToAfter(view);
          }
          return true;
        }

        // Arrow keys at boundaries
        if (
          (event.key === "ArrowUp" || event.key === "ArrowLeft") &&
          textarea
        ) {
          if (textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
            event.preventDefault();
            hidePopover();
            exitToBefore(view);
            return true;
          }
        }

        if (
          (event.key === "ArrowDown" || event.key === "ArrowRight") &&
          textarea
        ) {
          const len = textarea.value.length;
          if (
            textarea.selectionStart === len &&
            textarea.selectionEnd === len
          ) {
            event.preventDefault();
            hidePopover();
            exitToAfter(view);
            return true;
          }
        }

        // All other keys: ensure textarea has focus, block ProseMirror
        if (textarea && document.activeElement !== textarea) {
          textarea.focus();
        }
        return true; // Block ProseMirror from handling
      },

      // Handle clicks outside the popover
      handleClick(_view, _pos, event): boolean {
        if (editingPos === null) return false;

        // If click is inside popover, let it through
        if (popover?.contains(event.target as Node)) {
          return false;
        }

        // Click elsewhere - will change selection, plugin view will hide popover
        return false;
      },
    },

    view(view) {
      editorView = view;

      // Create and attach popover
      popover = createPopoverDOM();
      textarea = popover.querySelector("textarea");
      view.dom.parentElement?.appendChild(popover);

      return {
        update(view, _prevState) {
          const { selection } = view.state;

          // Check if NodeSelection on math_display
          if (selection instanceof NodeSelection) {
            const node = selection.node;
            if (node.type.name === "math_display") {
              const pos = selection.from;

              // If already editing this node, just update content if changed externally
              if (editingPos === pos) {
                // Content might have changed via undo/redo
                if (textarea && textarea.value !== node.attrs.content) {
                  textarea.value = node.attrs.content as string;
                }
                return;
              }

              // New math node selected
              showPopover(view, pos, node.attrs.content as string);
              return;
            }
          }

          // Selection changed away from math node
          if (editingPos !== null) {
            hidePopover();
          }
        },

        destroy() {
          hidePopover();
          if (popover) {
            popover.remove();
            popover = null;
          }
          textarea = null;
          editorView = null;
        },
      };
    },
  });
}

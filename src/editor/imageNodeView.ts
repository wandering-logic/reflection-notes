/**
 * NodeView for image nodes.
 * Uses ImageManager to resolve relative paths to blob URLs.
 */

import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { getImageManager } from "./ImageManager";
import { categorizeImageSrc } from "./imageUtils";

/**
 * NodeView for image nodes that resolves relative src to blob URLs.
 * Uses ImageManager for all blob URL management.
 */
export function createImageNodeView(
  node: Node,
  view: EditorView,
  _getPos: () => number | undefined,
) {
  const dom = document.createElement("img");
  dom.className = "pm-image";
  dom.draggable = true;

  // Track current src to avoid reloading the same image
  let currentSrc: string | null = null;

  function updateAttrs(n: Node) {
    const src = n.attrs.src as string;

    if (n.attrs.alt) {
      dom.alt = n.attrs.alt;
    } else {
      dom.removeAttribute("alt");
    }

    if (n.attrs.title) {
      dom.title = n.attrs.title;
    } else {
      dom.removeAttribute("title");
    }

    // If src hasn't changed, nothing to do
    if (src === currentSrc) return;
    currentSrc = src;

    // Clear previous error/loading states
    dom.classList.remove("pm-image-loading", "pm-image-error");

    // Handle placeholder states (for async remote URL fetching)
    if (src.startsWith("placeholder:")) {
      if (src.startsWith("placeholder:loading")) {
        dom.classList.add("pm-image-loading");
        dom.src = "";
        dom.alt = "Loading image...";
      } else if (src === "placeholder:failed") {
        dom.classList.add("pm-image-error");
        dom.src = "";
        dom.alt = "Failed to load image";
      }
      return;
    }

    // For non-relative paths (data: URLs, remote URLs, blob URLs), use directly
    const srcType = categorizeImageSrc(src);
    if (srcType !== "relative") {
      dom.src = src;
      return;
    }

    // Relative path - get blob URL from ImageManager
    const manager = getImageManager(view);
    if (!manager) {
      console.warn("No ImageManager available for image:", src);
      dom.src = "";
      return;
    }

    // Show loading state while fetching
    dom.classList.add("pm-image-loading");

    manager
      .getBlobUrl(src)
      .then((blobUrl) => {
        // Only update if src hasn't changed while we were loading
        if (currentSrc === src) {
          dom.src = blobUrl;
          dom.classList.remove("pm-image-loading");
        }
      })
      .catch((err) => {
        console.error("Failed to load image:", src, err);
        if (currentSrc === src) {
          dom.classList.remove("pm-image-loading");
          dom.classList.add("pm-image-error");
        }
      });
  }

  updateAttrs(node);

  return {
    dom,
    update(updatedNode: Node) {
      if (updatedNode.type.name !== "image") {
        return false;
      }
      updateAttrs(updatedNode);
      return true;
    },
    selectNode() {
      dom.classList.add("pm-image-selected");
    },
    deselectNode() {
      dom.classList.remove("pm-image-selected");
    },
    // No destroy needed - ImageManager owns blob URL lifecycle
  };
}

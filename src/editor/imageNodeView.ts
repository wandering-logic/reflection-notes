import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

// Map from relative path to blob URL, stored per EditorView
const imageBlobUrls = new WeakMap<EditorView, Map<string, string>>();

/**
 * Set all image blob URLs for a view (called when loading a note).
 */
export function setImageBlobUrls(
  view: EditorView,
  urls: Map<string, string>,
): void {
  // Revoke old URLs first
  const oldUrls = imageBlobUrls.get(view);
  if (oldUrls) {
    for (const url of oldUrls.values()) {
      if (url) URL.revokeObjectURL(url);
    }
  }
  imageBlobUrls.set(view, urls);
}

/**
 * Add a single image blob URL (called after pasting an image).
 */
export function addImageBlobUrl(
  view: EditorView,
  relativePath: string,
  blobUrl: string,
): void {
  let urls = imageBlobUrls.get(view);
  if (!urls) {
    urls = new Map();
    imageBlobUrls.set(view, urls);
  }
  urls.set(relativePath, blobUrl);
}

/**
 * Get blob URL for a relative path.
 */
function getBlobUrl(
  view: EditorView,
  relativePath: string,
): string | undefined {
  return imageBlobUrls.get(view)?.get(relativePath);
}

/**
 * NodeView for image nodes that resolves relative src to blob URLs.
 */
export function createImageNodeView(
  node: Node,
  view: EditorView,
  _getPos: () => number | undefined,
) {
  const dom = document.createElement("img");
  dom.className = "pm-image";
  dom.draggable = true;

  function updateAttrs(n: Node) {
    const src = n.attrs.src as string;
    const blobUrl = getBlobUrl(view, src);

    // Use blob URL if available, otherwise fall back to raw src
    // (raw src might work for data: URLs or external URLs)
    dom.src = blobUrl || src;

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
  };
}

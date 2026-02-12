import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { categorizeImageSrc } from "./imageUtils";
import {
  isFailedPlaceholder,
  isLoadingPlaceholder,
  isPlaceholder,
} from "./placeholderState";

/**
 * Context for loading assets (images, etc.) from the filesystem.
 * Provided by main.ts when a note is loaded.
 */
export interface AssetLoadContext {
  loadAsset: (relativePath: string) => Promise<Blob>;
}

// Asset load context per view
const assetLoadContexts = new WeakMap<EditorView, AssetLoadContext>();

/**
 * Set the asset load context for a view.
 * Called from main.ts when a note is loaded/created.
 */
export function setAssetLoadContext(
  view: EditorView,
  context: AssetLoadContext,
): void {
  assetLoadContexts.set(view, context);
}

// Map from relative path to blob URL, stored per EditorView
// Used as a hand-off for freshly pasted images (where we already have the blob)
const imageBlobUrls = new WeakMap<EditorView, Map<string, string>>();

/**
 * Add a single image blob URL (called after pasting an image).
 * The NodeView will take ownership of this URL and revoke it when destroyed.
 * Also caches the blob for copy operations.
 */
export function addImageBlobUrl(
  view: EditorView,
  relativePath: string,
  blobUrl: string,
  originalBlob?: Blob,
): void {
  let urls = imageBlobUrls.get(view);
  if (!urls) {
    urls = new Map();
    imageBlobUrls.set(view, urls);
  }
  urls.set(relativePath, blobUrl);

  // If we have the original blob, cache it for copy operations
  if (originalBlob) {
    cacheForCopy(view, relativePath, originalBlob);
  }
}

/**
 * Take ownership of a blob URL from the cache (removes it from cache).
 * Returns undefined if not in cache.
 */
function takeBlobUrl(
  view: EditorView,
  relativePath: string,
): string | undefined {
  const urls = imageBlobUrls.get(view);
  if (!urls) return undefined;
  const url = urls.get(relativePath);
  if (url) {
    urls.delete(relativePath);
  }
  return url;
}

// Cache blobs for single-image copy (to write to clipboard as image data)
const imageBlobsForCopy = new WeakMap<EditorView, Map<string, Blob>>();

// Cache data URLs for rich-text copy (to embed in HTML)
const imageDataUrls = new WeakMap<EditorView, Map<string, string>>();

/**
 * Cache blob and data URL for copy operations.
 * Called when images are loaded from filesystem.
 */
function cacheForCopy(view: EditorView, relativePath: string, blob: Blob) {
  // Cache blob directly
  let blobs = imageBlobsForCopy.get(view);
  if (!blobs) {
    blobs = new Map();
    imageBlobsForCopy.set(view, blobs);
  }
  blobs.set(relativePath, blob);

  // Also create and cache data URL
  const reader = new FileReader();
  reader.onloadend = () => {
    let urls = imageDataUrls.get(view);
    if (!urls) {
      urls = new Map();
      imageDataUrls.set(view, urls);
    }
    urls.set(relativePath, reader.result as string);
  };
  reader.readAsDataURL(blob);
}

/**
 * Get cached blob for copy operation.
 */
export function getImageBlob(
  view: EditorView,
  relativePath: string,
): Blob | undefined {
  return imageBlobsForCopy.get(view)?.get(relativePath);
}

/**
 * Get cached data URL for copy operation.
 */
export function getImageDataUrl(
  view: EditorView,
  relativePath: string,
): string | undefined {
  return imageDataUrls.get(view)?.get(relativePath);
}

/**
 * NodeView for image nodes that resolves relative src to blob URLs.
 * Loads images on demand and manages blob URL lifecycle.
 */
export function createImageNodeView(
  node: Node,
  view: EditorView,
  _getPos: () => number | undefined,
) {
  const dom = document.createElement("img");
  dom.className = "pm-image";
  dom.draggable = true;

  // The blob URL we own (will revoke on destroy)
  let ownedBlobUrl: string | null = null;

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

    // Handle placeholder states (for async image fetching)
    if (isPlaceholder(src)) {
      if (isLoadingPlaceholder(src)) {
        dom.classList.add("pm-image-loading");
        dom.src = "";
        dom.alt = "Loading image...";
      } else if (isFailedPlaceholder(src)) {
        dom.classList.add("pm-image-error");
        dom.src = "";
        dom.alt = "Failed to load image";
      }
      return;
    }

    // For non-relative paths (data: URLs, remote URLs, blob URLs), use directly
    if (categorizeImageSrc(src) !== "relative") {
      dom.src = src;
      return;
    }

    // Check if we already have a blob URL from paste
    const cachedUrl = takeBlobUrl(view, src);
    if (cachedUrl) {
      ownedBlobUrl = cachedUrl;
      dom.src = cachedUrl;
      return;
    }

    // Need to load from filesystem
    const context = assetLoadContexts.get(view);
    if (!context) {
      console.warn("No asset load context available for image:", src);
      dom.src = "";
      return;
    }

    // Show loading state
    dom.classList.add("pm-image-loading");

    context
      .loadAsset(src)
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        ownedBlobUrl = blobUrl;
        dom.src = blobUrl;
        dom.classList.remove("pm-image-loading");
        // Cache for copy operations
        cacheForCopy(view, src, blob);
      })
      .catch((err) => {
        console.error("Failed to load image:", src, err);
        dom.classList.remove("pm-image-loading");
        dom.classList.add("pm-image-error");
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
    destroy() {
      if (ownedBlobUrl) {
        URL.revokeObjectURL(ownedBlobUrl);
        ownedBlobUrl = null;
      }
    },
  };
}

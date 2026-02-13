/**
 * ImageManager - owns the entire image lifecycle for a note.
 *
 * Responsibilities:
 * - Ingest: Save images from various sources (file, data URL, remote URL, blob) to disk
 * - Display: Provide blob URLs for rendering images
 * - Export: Provide data URLs for clipboard operations
 * - Cleanup: Revoke blob URLs when note closes
 */

import type { EditorView } from "prosemirror-view";
import type { FileSystemProvider } from "../storage/filesystem";
import {
  generateImageFilename,
  getMimeTypeFromExtension,
  isAllowedImageType,
  parseDataUrl,
} from "../storage/image";
import type { Notebook } from "../storage/notebook";

/** Image source types for ingestion */
export type ImageSource =
  | { type: "file"; file: File }
  | { type: "dataUrl"; dataUrl: string }
  | { type: "remoteUrl"; url: string }
  | { type: "blob"; blob: Blob };

/** Cached image data */
interface CacheEntry {
  blobUrl?: string;
  dataUrl?: string;
  blob?: Blob;
}

/**
 * ImageManager handles all image operations for a single note.
 */
export class ImageManager {
  private cache = new Map<string, CacheEntry>();
  private fs: FileSystemProvider;
  private notebook: Notebook;
  private notePath: string;

  constructor(fs: FileSystemProvider, notebook: Notebook, notePath: string) {
    this.fs = fs;
    this.notebook = notebook;
    this.notePath = notePath;
  }

  /**
   * Ingest an image from any source: save to disk and cache for display.
   * Returns the relative path (filename) of the saved image.
   */
  async ingest(source: ImageSource): Promise<{ relativePath: string }> {
    const { bytes, mimeType, suggestedName } = await this.getBytes(source);

    if (!isAllowedImageType(mimeType)) {
      throw new Error(`Unsupported image type: ${mimeType}`);
    }

    // Generate filename and save to disk
    const filename = generateImageFilename(suggestedName, mimeType);
    await this.fs.writeBinaryFile(
      this.notebook.handle,
      `${this.notePath}/${filename}`,
      bytes,
    );

    // Create blob and cache for immediate display
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    this.cache.set(filename, { blobUrl, blob });

    return { relativePath: filename };
  }

  /**
   * Get bytes from any image source.
   */
  private async getBytes(source: ImageSource): Promise<{
    bytes: ArrayBuffer;
    mimeType: string;
    suggestedName: string;
  }> {
    switch (source.type) {
      case "file":
        return {
          bytes: await source.file.arrayBuffer(),
          mimeType: source.file.type,
          suggestedName: source.file.name,
        };

      case "dataUrl": {
        const parsed = parseDataUrl(source.dataUrl);
        if (!parsed) {
          throw new Error("Invalid data URL");
        }
        return {
          bytes: parsed.data,
          mimeType: parsed.mimeType,
          suggestedName: "image",
        };
      }

      case "remoteUrl": {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const blob = await response.blob();
        // Extract filename from URL path
        const urlPath = new URL(source.url).pathname;
        const suggestedName = urlPath.split("/").pop() || "image";
        return {
          bytes: await blob.arrayBuffer(),
          mimeType: blob.type,
          suggestedName,
        };
      }

      case "blob":
        return {
          bytes: await source.blob.arrayBuffer(),
          mimeType: source.blob.type,
          suggestedName: "image",
        };
    }
  }

  /**
   * Get a blob URL for displaying an image.
   * Loads from disk if not already cached.
   */
  async getBlobUrl(relativePath: string): Promise<string> {
    const cached = this.cache.get(relativePath);
    if (cached?.blobUrl) {
      return cached.blobUrl;
    }

    // Load from filesystem
    const bytes = await this.fs.readBinaryFile(
      this.notebook.handle,
      `${this.notePath}/${relativePath}`,
    );

    const mimeType = getMimeTypeFromExtension(relativePath);
    const blob = new Blob([bytes], mimeType ? { type: mimeType } : undefined);
    const blobUrl = URL.createObjectURL(blob);

    // Cache for future use
    const entry = cached || {};
    entry.blobUrl = blobUrl;
    entry.blob = blob;
    this.cache.set(relativePath, entry);

    return blobUrl;
  }

  /**
   * Get a data URL for clipboard operations.
   * Loads from disk if not already cached.
   */
  async getDataUrl(relativePath: string): Promise<string> {
    const cached = this.cache.get(relativePath);
    if (cached?.dataUrl) {
      return cached.dataUrl;
    }

    // Get or load the blob
    let blob = cached?.blob;
    if (!blob) {
      const bytes = await this.fs.readBinaryFile(
        this.notebook.handle,
        `${this.notePath}/${relativePath}`,
      );
      const mimeType = getMimeTypeFromExtension(relativePath);
      blob = new Blob([bytes], mimeType ? { type: mimeType } : undefined);
    }

    // Convert to data URL
    const dataUrl = await this.blobToDataUrl(blob);

    // Cache for future use
    const entry = cached || {};
    entry.dataUrl = dataUrl;
    entry.blob = blob;
    this.cache.set(relativePath, entry);

    return dataUrl;
  }

  /**
   * Get the cached blob for an image (for clipboard PNG conversion).
   * Returns undefined if not cached.
   */
  getBlob(relativePath: string): Blob | undefined {
    return this.cache.get(relativePath)?.blob;
  }

  /**
   * Convert blob to data URL.
   */
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read blob"));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Dispose of all cached blob URLs.
   * Call this when switching notes to prevent memory leaks.
   */
  dispose(): void {
    for (const entry of this.cache.values()) {
      if (entry.blobUrl) {
        URL.revokeObjectURL(entry.blobUrl);
      }
    }
    this.cache.clear();
  }
}

// WeakMap to associate ImageManager with EditorView
const managers = new WeakMap<EditorView, ImageManager>();

/**
 * Set the ImageManager for a view.
 * Called from main.ts when a note is loaded.
 */
export function setImageManager(view: EditorView, manager: ImageManager): void {
  managers.set(view, manager);
}

/**
 * Get the ImageManager for a view.
 */
export function getImageManager(view: EditorView): ImageManager | undefined {
  return managers.get(view);
}

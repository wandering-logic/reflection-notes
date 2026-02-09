import { ulid } from "ulid";
import type { FileSystemProvider } from "./filesystem";
import type { Notebook } from "./notebook";

/** Allowed MIME types mapped to file extensions */
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
};

/** Extension to MIME type mapping (reverse of ALLOWED_TYPES) */
const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

/**
 * Get MIME type from file extension.
 * Returns undefined if extension is not recognized.
 */
export function getMimeTypeFromExtension(filename: string): string | undefined {
  const ext = filename.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return ext ? EXT_TO_MIME[ext] : undefined;
}

export interface ImageSaveResult {
  /** Relative path within note directory (just the filename) */
  relativePath: string;
}

/**
 * Check if a MIME type is allowed for image upload.
 */
export function isAllowedImageType(mimeType: string): boolean {
  return mimeType in ALLOWED_TYPES;
}

/**
 * Sanitize filename for filesystem safety.
 * Removes special characters, limits length.
 */
function sanitizeFilename(name: string): string {
  // Remove extension if present
  const base = name.replace(/\.[^.]+$/, "");
  // Keep only alphanumeric, dash, underscore
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 50);
  return sanitized;
}

/**
 * Generate image filename: ULID[-sanitizedFilename].ext
 */
export function generateImageFilename(
  originalName: string,
  mimeType: string,
): string {
  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  const id = ulid();
  const sanitized = sanitizeFilename(originalName);

  return sanitized ? `${id}-${sanitized}${ext}` : `${id}${ext}`;
}

/**
 * Save image file to note directory.
 */
export async function saveImage(
  fs: FileSystemProvider,
  notebook: Notebook,
  notePath: string,
  file: File,
): Promise<ImageSaveResult> {
  if (!isAllowedImageType(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }

  const filename = generateImageFilename(file.name, file.type);
  const data = await file.arrayBuffer();

  // Path: notePath/filename (e.g., 2026/02/07/1/ULID.png)
  await fs.writeBinaryFile(notebook.handle, `${notePath}/${filename}`, data);

  return { relativePath: filename };
}

export interface ParsedDataUrl {
  mimeType: string;
  data: ArrayBuffer;
}

/**
 * Parse a data URL into its MIME type and binary data.
 * Returns null if the URL is not a valid data URL.
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const base64 = match[2];

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { mimeType, data: bytes.buffer };
  } catch {
    return null;
  }
}

/**
 * Save image from a Blob to note directory.
 * Used for images fetched from URLs or decoded from data URLs.
 */
export async function saveImageFromBlob(
  fs: FileSystemProvider,
  notebook: Notebook,
  notePath: string,
  blob: Blob,
  suggestedName: string,
): Promise<ImageSaveResult> {
  if (!isAllowedImageType(blob.type)) {
    throw new Error(`Unsupported image type: ${blob.type}`);
  }

  const filename = generateImageFilename(suggestedName, blob.type);
  const data = await blob.arrayBuffer();

  await fs.writeBinaryFile(notebook.handle, `${notePath}/${filename}`, data);

  return { relativePath: filename };
}

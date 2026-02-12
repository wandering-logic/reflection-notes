/**
 * Shared utilities for image source classification.
 *
 * Image sources in this app can be:
 * - "data": Base64-encoded data URLs (data:image/png;base64,...)
 * - "remote": HTTP/HTTPS URLs to external servers
 * - "blob": Temporary blob URLs (blob:http://...)
 * - "relative": Local file paths relative to the note
 * - "placeholder": Internal placeholder URLs during paste operations
 */

/** Categorize image src types */
export type ImageSrcType = "remote" | "data" | "relative" | "blob" | "placeholder";

/**
 * Categorize an image src by its URL scheme.
 */
export function categorizeImageSrc(src: string): ImageSrcType {
  if (src.startsWith("data:")) return "data";
  if (src.startsWith("http://") || src.startsWith("https://")) return "remote";
  if (src.startsWith("blob:")) return "blob";
  if (src.startsWith("placeholder:")) return "placeholder";
  return "relative";
}

import { describe, expect, it } from "vitest";
import {
  generateImageFilename,
  getMimeTypeFromExtension,
  isAllowedImageType,
  parseDataUrl,
  sanitizeFilename,
} from "./image";

describe("getMimeTypeFromExtension", () => {
  it("returns correct MIME type for .png", () => {
    expect(getMimeTypeFromExtension("photo.png")).toBe("image/png");
  });

  it("returns correct MIME type for .jpg", () => {
    expect(getMimeTypeFromExtension("photo.jpg")).toBe("image/jpeg");
  });

  it("returns correct MIME type for .jpeg", () => {
    expect(getMimeTypeFromExtension("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns correct MIME type for .gif", () => {
    expect(getMimeTypeFromExtension("animation.gif")).toBe("image/gif");
  });

  it("is case-insensitive", () => {
    expect(getMimeTypeFromExtension("photo.PNG")).toBe("image/png");
    expect(getMimeTypeFromExtension("photo.JPG")).toBe("image/jpeg");
    expect(getMimeTypeFromExtension("photo.GIF")).toBe("image/gif");
  });

  it("returns undefined for unknown extensions", () => {
    expect(getMimeTypeFromExtension("file.webp")).toBeUndefined();
    expect(getMimeTypeFromExtension("file.bmp")).toBeUndefined();
    expect(getMimeTypeFromExtension("file.svg")).toBeUndefined();
  });

  it("returns undefined for files without extension", () => {
    expect(getMimeTypeFromExtension("noextension")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getMimeTypeFromExtension("")).toBeUndefined();
  });

  it("handles multiple dots correctly (uses last extension)", () => {
    expect(getMimeTypeFromExtension("file.backup.png")).toBe("image/png");
    expect(getMimeTypeFromExtension("my.photo.jpg")).toBe("image/jpeg");
  });

  it("returns undefined for dot-only filename", () => {
    expect(getMimeTypeFromExtension(".")).toBeUndefined();
  });
});

describe("isAllowedImageType", () => {
  it("allows image/png", () => {
    expect(isAllowedImageType("image/png")).toBe(true);
  });

  it("allows image/jpeg", () => {
    expect(isAllowedImageType("image/jpeg")).toBe(true);
  });

  it("allows image/gif", () => {
    expect(isAllowedImageType("image/gif")).toBe(true);
  });

  it("rejects image/webp", () => {
    expect(isAllowedImageType("image/webp")).toBe(false);
  });

  it("rejects image/svg+xml", () => {
    expect(isAllowedImageType("image/svg+xml")).toBe(false);
  });

  it("rejects non-image types", () => {
    expect(isAllowedImageType("text/plain")).toBe(false);
    expect(isAllowedImageType("application/pdf")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedImageType("")).toBe(false);
  });

  it("is case-sensitive (MIME types are lowercase by spec)", () => {
    expect(isAllowedImageType("IMAGE/PNG")).toBe(false);
    expect(isAllowedImageType("Image/Png")).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("keeps alphanumeric characters", () => {
    expect(sanitizeFilename("photo123")).toBe("photo123");
  });

  it("keeps dashes and underscores", () => {
    expect(sanitizeFilename("my-photo_2024")).toBe("my-photo_2024");
  });

  it("removes extension", () => {
    expect(sanitizeFilename("photo.png")).toBe("photo");
  });

  it("removes special characters", () => {
    expect(sanitizeFilename("photo@#$%")).toBe("photo");
  });

  it("removes spaces", () => {
    expect(sanitizeFilename("my photo")).toBe("myphoto");
  });

  it("removes unicode characters", () => {
    expect(sanitizeFilename("фото")).toBe("");
    expect(sanitizeFilename("照片")).toBe("");
    expect(sanitizeFilename("photo日本")).toBe("photo");
  });

  it("truncates to 50 characters", () => {
    const longName = "a".repeat(100);
    expect(sanitizeFilename(longName)).toHaveLength(50);
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeFilename("")).toBe("");
  });

  it("returns empty string for only special characters", () => {
    expect(sanitizeFilename("@#$%^&*()")).toBe("");
  });

  it("handles only extension input", () => {
    expect(sanitizeFilename(".png")).toBe("");
  });

  it("handles multiple dots (removes only last extension)", () => {
    expect(sanitizeFilename("my.backup.photo.png")).toBe("mybackupphoto");
  });
});

describe("generateImageFilename", () => {
  it("generates filename with ULID prefix for png", () => {
    const result = generateImageFilename("photo.png", "image/png");
    expect(result).toMatch(/^[0-9A-Z]{26}-photo\.png$/);
  });

  it("generates filename with ULID prefix for jpeg", () => {
    const result = generateImageFilename("photo.jpg", "image/jpeg");
    expect(result).toMatch(/^[0-9A-Z]{26}-photo\.jpg$/);
  });

  it("generates filename with ULID prefix for gif", () => {
    const result = generateImageFilename("animation.gif", "image/gif");
    expect(result).toMatch(/^[0-9A-Z]{26}-animation\.gif$/);
  });

  it("uses correct extension based on MIME type, not original", () => {
    // Original has .jpeg but MIME type maps to .jpg
    const result = generateImageFilename("photo.jpeg", "image/jpeg");
    expect(result).toMatch(/^[0-9A-Z]{26}-photo\.jpg$/);
  });

  it("generates ULID-only filename when sanitized name is empty", () => {
    const result = generateImageFilename("@#$%.png", "image/png");
    expect(result).toMatch(/^[0-9A-Z]{26}\.png$/);
  });

  it("throws for unsupported MIME type", () => {
    expect(() => generateImageFilename("photo.webp", "image/webp")).toThrow(
      "Unsupported MIME type: image/webp",
    );
  });

  it("generates unique filenames on consecutive calls", () => {
    const result1 = generateImageFilename("photo.png", "image/png");
    const result2 = generateImageFilename("photo.png", "image/png");
    expect(result1).not.toBe(result2);
  });

  it("sanitizes filename with special characters", () => {
    const result = generateImageFilename("my photo (1).png", "image/png");
    expect(result).toMatch(/^[0-9A-Z]{26}-myphoto1\.png$/);
  });
});

describe("parseDataUrl", () => {
  it("parses valid PNG data URL", () => {
    // A minimal 1x1 transparent PNG
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const result = parseDataUrl(dataUrl);

    if (result === null) {
      throw new Error("Expected result to not be null");
    }
    expect(result.mimeType).toBe("image/png");
    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect(result.data.byteLength).toBeGreaterThan(0);
  });

  it("parses valid JPEG data URL", () => {
    // Minimal JPEG header
    const dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const result = parseDataUrl(dataUrl);

    if (result === null) {
      throw new Error("Expected result to not be null");
    }
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("returns null for non-data URL", () => {
    expect(parseDataUrl("https://example.com/image.png")).toBeNull();
    expect(parseDataUrl("blob:http://localhost/123")).toBeNull();
  });

  it("returns null for data URL without base64", () => {
    expect(parseDataUrl("data:text/plain,Hello")).toBeNull();
  });

  it("returns null for invalid base64", () => {
    expect(parseDataUrl("data:image/png;base64,!!!invalid!!!")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDataUrl("")).toBeNull();
  });

  it("returns null for malformed data URL", () => {
    expect(parseDataUrl("data:")).toBeNull();
    expect(parseDataUrl("data:image/png")).toBeNull();
    expect(parseDataUrl("data:;base64,abc")).toBeNull();
  });

  it("correctly decodes base64 to binary", () => {
    // "Hello" in base64
    const dataUrl = "data:text/plain;base64,SGVsbG8=";
    const result = parseDataUrl(dataUrl);

    if (result === null) {
      throw new Error("Expected result to not be null");
    }
    const bytes = new Uint8Array(result.data);
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe("Hello");
  });
});

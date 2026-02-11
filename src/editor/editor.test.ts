import { describe, expect, it } from "vitest";
import { categorizeImageSrc, type ImageSrcType } from "./editor";

describe("categorizeImageSrc", () => {
  describe("data URLs", () => {
    it("categorizes data:image/png as data", () => {
      expect(categorizeImageSrc("data:image/png;base64,abc")).toBe("data");
    });

    it("categorizes data:image/jpeg as data", () => {
      expect(categorizeImageSrc("data:image/jpeg;base64,abc")).toBe("data");
    });

    it("categorizes data:text/plain as data", () => {
      expect(categorizeImageSrc("data:text/plain;base64,abc")).toBe("data");
    });

    it("categorizes minimal data: prefix as data", () => {
      expect(categorizeImageSrc("data:")).toBe("data");
    });
  });

  describe("remote URLs", () => {
    it("categorizes https:// as remote", () => {
      expect(categorizeImageSrc("https://example.com/image.png")).toBe(
        "remote",
      );
    });

    it("categorizes http:// as remote", () => {
      expect(categorizeImageSrc("http://example.com/image.png")).toBe("remote");
    });

    it("categorizes HTTPS with port as remote", () => {
      expect(categorizeImageSrc("https://example.com:8080/image.png")).toBe(
        "remote",
      );
    });

    it("categorizes HTTP with query string as remote", () => {
      expect(categorizeImageSrc("http://example.com/img?v=1")).toBe("remote");
    });
  });

  describe("blob URLs", () => {
    it("categorizes blob:http as blob", () => {
      expect(categorizeImageSrc("blob:http://localhost:3000/abc-123-def")).toBe(
        "blob",
      );
    });

    it("categorizes blob:https as blob", () => {
      expect(categorizeImageSrc("blob:https://example.com/abc-123-def")).toBe(
        "blob",
      );
    });

    it("categorizes minimal blob: prefix as blob", () => {
      expect(categorizeImageSrc("blob:")).toBe("blob");
    });
  });

  describe("relative paths", () => {
    it("categorizes simple filename as relative", () => {
      expect(categorizeImageSrc("image.png")).toBe("relative");
    });

    it("categorizes path with directory as relative", () => {
      expect(categorizeImageSrc("assets/image.png")).toBe("relative");
    });

    it("categorizes ULID filename as relative", () => {
      expect(categorizeImageSrc("01HQGK7MXNP8R5VWBCJ2YG6DTH-photo.png")).toBe(
        "relative",
      );
    });

    it("categorizes ./relative path as relative", () => {
      expect(categorizeImageSrc("./image.png")).toBe("relative");
    });

    it("categorizes ../parent path as relative", () => {
      expect(categorizeImageSrc("../image.png")).toBe("relative");
    });

    it("categorizes absolute path as relative", () => {
      // Note: /path/to/image is treated as relative by this function
      // (not starting with http/https/data/blob)
      expect(categorizeImageSrc("/path/to/image.png")).toBe("relative");
    });

    it("categorizes empty string as relative", () => {
      expect(categorizeImageSrc("")).toBe("relative");
    });
  });

  describe("edge cases", () => {
    it("is case-sensitive for scheme detection", () => {
      // Uppercase schemes are treated as relative
      expect(categorizeImageSrc("HTTPS://example.com/image.png")).toBe(
        "relative",
      );
      expect(categorizeImageSrc("DATA:image/png;base64,abc")).toBe("relative");
    });

    it("handles file:// URLs as relative (not remote)", () => {
      // file:// is not http/https, so treated as relative
      expect(categorizeImageSrc("file:///path/to/image.png")).toBe("relative");
    });

    it("handles ftp:// URLs as relative (not remote)", () => {
      // ftp:// is not http/https, so treated as relative
      expect(categorizeImageSrc("ftp://example.com/image.png")).toBe(
        "relative",
      );
    });
  });

  describe("type safety", () => {
    it("returns a valid ImageSrcType", () => {
      const result: ImageSrcType = categorizeImageSrc("test.png");
      const validTypes: ImageSrcType[] = ["remote", "data", "relative", "blob"];
      expect(validTypes).toContain(result);
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  createLoadingPlaceholder,
  generatePlaceholderId,
  isFailedPlaceholder,
  isLoadingPlaceholder,
  isPlaceholder,
  parsePlaceholder,
  resolvePlaceholder,
  serializePlaceholder,
  transitionPlaceholder,
  type PlaceholderState,
} from "./placeholderState";

describe("PlaceholderState", () => {
  describe("generatePlaceholderId", () => {
    it("generates unique IDs", () => {
      const id1 = generatePlaceholderId();
      const id2 = generatePlaceholderId();
      expect(id1).not.toBe(id2);
    });

    it("generates non-empty strings", () => {
      const id = generatePlaceholderId();
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe("createLoadingPlaceholder", () => {
    it("creates loading state with generated ID", () => {
      const state = createLoadingPlaceholder();
      expect(state.status).toBe("loading");
      expect(state).toHaveProperty("id");
    });

    it("creates loading state with provided ID", () => {
      const state = createLoadingPlaceholder("custom-id");
      expect(state).toEqual({ status: "loading", id: "custom-id" });
    });
  });

  describe("serializePlaceholder", () => {
    it("serializes loading state", () => {
      const state: PlaceholderState = { status: "loading", id: "abc123" };
      expect(serializePlaceholder(state)).toBe("placeholder:loading-abc123");
    });

    it("serializes resolved state to just the path", () => {
      const state: PlaceholderState = {
        status: "resolved",
        path: "01ABC-image.png",
      };
      expect(serializePlaceholder(state)).toBe("01ABC-image.png");
    });

    it("serializes failed state", () => {
      const state: PlaceholderState = { status: "failed" };
      expect(serializePlaceholder(state)).toBe("placeholder:failed");
    });
  });

  describe("parsePlaceholder", () => {
    it("parses loading placeholder", () => {
      expect(parsePlaceholder("placeholder:loading-abc123")).toEqual({
        status: "loading",
        id: "abc123",
      });
    });

    it("parses loading placeholder with complex ID", () => {
      expect(
        parsePlaceholder("placeholder:loading-1707123456789-k7x9m2"),
      ).toEqual({
        status: "loading",
        id: "1707123456789-k7x9m2",
      });
    });

    it("parses failed placeholder", () => {
      expect(parsePlaceholder("placeholder:failed")).toEqual({
        status: "failed",
      });
    });

    it("returns null for regular paths", () => {
      expect(parsePlaceholder("01ABC-image.png")).toBeNull();
    });

    it("returns null for data URLs", () => {
      expect(parsePlaceholder("data:image/png;base64,abc")).toBeNull();
    });

    it("returns null for remote URLs", () => {
      expect(parsePlaceholder("https://example.com/image.png")).toBeNull();
    });

    it("returns null for blob URLs", () => {
      expect(parsePlaceholder("blob:http://localhost/abc")).toBeNull();
    });
  });

  describe("isPlaceholder", () => {
    it("returns true for loading placeholder", () => {
      expect(isPlaceholder("placeholder:loading-abc")).toBe(true);
    });

    it("returns true for failed placeholder", () => {
      expect(isPlaceholder("placeholder:failed")).toBe(true);
    });

    it("returns false for regular path", () => {
      expect(isPlaceholder("image.png")).toBe(false);
    });

    it("returns false for data URL", () => {
      expect(isPlaceholder("data:image/png;base64,abc")).toBe(false);
    });
  });

  describe("isLoadingPlaceholder", () => {
    it("returns true for loading placeholder", () => {
      expect(isLoadingPlaceholder("placeholder:loading-abc")).toBe(true);
    });

    it("returns false for failed placeholder", () => {
      expect(isLoadingPlaceholder("placeholder:failed")).toBe(false);
    });

    it("returns false for regular path", () => {
      expect(isLoadingPlaceholder("image.png")).toBe(false);
    });
  });

  describe("isFailedPlaceholder", () => {
    it("returns true for failed placeholder", () => {
      expect(isFailedPlaceholder("placeholder:failed")).toBe(true);
    });

    it("returns false for loading placeholder", () => {
      expect(isFailedPlaceholder("placeholder:loading-abc")).toBe(false);
    });

    it("returns false for regular path", () => {
      expect(isFailedPlaceholder("image.png")).toBe(false);
    });
  });

  describe("transitionPlaceholder", () => {
    describe("from loading state", () => {
      const loadingState: PlaceholderState = { status: "loading", id: "abc" };

      it("fetch_success -> resolved", () => {
        const result = transitionPlaceholder(loadingState, {
          type: "fetch_success",
          path: "01ABC-image.png",
        });
        expect(result).toEqual({
          status: "resolved",
          path: "01ABC-image.png",
        });
      });

      it("fetch_failure -> failed", () => {
        const result = transitionPlaceholder(loadingState, {
          type: "fetch_failure",
        });
        expect(result).toEqual({ status: "failed" });
      });
    });

    describe("from resolved state", () => {
      const resolvedState: PlaceholderState = {
        status: "resolved",
        path: "image.png",
      };

      it("fetch_success is invalid", () => {
        const result = transitionPlaceholder(resolvedState, {
          type: "fetch_success",
          path: "other.png",
        });
        expect(result).toBeNull();
      });

      it("fetch_failure is invalid", () => {
        const result = transitionPlaceholder(resolvedState, {
          type: "fetch_failure",
        });
        expect(result).toBeNull();
      });
    });

    describe("from failed state", () => {
      const failedState: PlaceholderState = { status: "failed" };

      it("fetch_success is invalid", () => {
        const result = transitionPlaceholder(failedState, {
          type: "fetch_success",
          path: "image.png",
        });
        expect(result).toBeNull();
      });

      it("fetch_failure is invalid", () => {
        const result = transitionPlaceholder(failedState, {
          type: "fetch_failure",
        });
        expect(result).toBeNull();
      });
    });
  });

  describe("resolvePlaceholder", () => {
    it("resolves loading placeholder to path on success", () => {
      const result = resolvePlaceholder("placeholder:loading-abc", {
        type: "fetch_success",
        path: "01ABC-image.png",
      });
      expect(result).toBe("01ABC-image.png");
    });

    it("resolves loading placeholder to failed on failure", () => {
      const result = resolvePlaceholder("placeholder:loading-abc", {
        type: "fetch_failure",
      });
      expect(result).toBe("placeholder:failed");
    });

    it("returns null for non-placeholder src", () => {
      const result = resolvePlaceholder("image.png", {
        type: "fetch_success",
        path: "other.png",
      });
      expect(result).toBeNull();
    });

    it("returns null for already failed placeholder", () => {
      const result = resolvePlaceholder("placeholder:failed", {
        type: "fetch_success",
        path: "image.png",
      });
      expect(result).toBeNull();
    });
  });

  describe("round-trip serialization", () => {
    it("loading state survives round-trip", () => {
      const original: PlaceholderState = { status: "loading", id: "test-123" };
      const serialized = serializePlaceholder(original);
      const parsed = parsePlaceholder(serialized);
      expect(parsed).toEqual(original);
    });

    it("failed state survives round-trip", () => {
      const original: PlaceholderState = { status: "failed" };
      const serialized = serializePlaceholder(original);
      const parsed = parsePlaceholder(serialized);
      expect(parsed).toEqual(original);
    });

    it("resolved state serializes to plain path (no round-trip)", () => {
      const original: PlaceholderState = {
        status: "resolved",
        path: "image.png",
      };
      const serialized = serializePlaceholder(original);
      expect(serialized).toBe("image.png");
      // Parsing returns null because it's not a placeholder anymore
      expect(parsePlaceholder(serialized)).toBeNull();
    });
  });
});

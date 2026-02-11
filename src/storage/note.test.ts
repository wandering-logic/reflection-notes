import { describe, expect, it } from "vitest";
import { createBlankDocument, extractCreated, extractTitle } from "./note";

describe("extractTitle", () => {
  it("extracts title from valid document", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "My Note Title" }] },
        { type: "created", attrs: { timestamp: 1234567890 } },
        { type: "paragraph" },
      ],
    };
    expect(extractTitle(doc)).toBe("My Note Title");
  });

  it("returns Untitled for empty title node", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title", content: [] },
        { type: "created", attrs: { timestamp: 1234567890 } },
        { type: "paragraph" },
      ],
    };
    expect(extractTitle(doc)).toBe("Untitled");
  });

  it("returns Untitled for title with no content property", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title" },
        { type: "created", attrs: { timestamp: 1234567890 } },
        { type: "paragraph" },
      ],
    };
    expect(extractTitle(doc)).toBe("Untitled");
  });

  it("returns Untitled for whitespace-only title", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "   " }] },
        { type: "created", attrs: { timestamp: 1234567890 } },
        { type: "paragraph" },
      ],
    };
    expect(extractTitle(doc)).toBe("Untitled");
  });

  it("returns Untitled when first node is not title", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
      ],
    };
    expect(extractTitle(doc)).toBe("Untitled");
  });

  it("returns Untitled for empty document", () => {
    const doc = { type: "doc", content: [] };
    expect(extractTitle(doc)).toBe("Untitled");
  });

  it("returns Untitled for document with no content", () => {
    const doc = { type: "doc" };
    expect(extractTitle(doc)).toBe("Untitled");
  });

  it("returns Untitled for null input", () => {
    expect(extractTitle(null)).toBe("Untitled");
  });

  it("returns Untitled for undefined input", () => {
    expect(extractTitle(undefined)).toBe("Untitled");
  });

  it("concatenates multiple text nodes in title", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "title",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "World" },
          ],
        },
      ],
    };
    expect(extractTitle(doc)).toBe("Hello World");
  });

  it("handles inline marks in title (text is still extracted)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "title",
          content: [
            { type: "text", text: "Bold", marks: [{ type: "strong" }] },
            { type: "text", text: " Title" },
          ],
        },
      ],
    };
    expect(extractTitle(doc)).toBe("Bold Title");
  });

  it("trims leading and trailing whitespace", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "  My Title  " }] },
      ],
    };
    expect(extractTitle(doc)).toBe("My Title");
  });
});

describe("extractCreated", () => {
  it("extracts timestamp from created node", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Note" }] },
        { type: "created", attrs: { timestamp: 1707350400000 } },
        { type: "paragraph" },
      ],
    };
    expect(extractCreated(doc)).toBe(1707350400000);
  });

  it("returns 0 when no created node exists", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Note" }] },
        { type: "paragraph" },
      ],
    };
    expect(extractCreated(doc)).toBe(0);
  });

  it("returns 0 for empty document", () => {
    const doc = { type: "doc", content: [] };
    expect(extractCreated(doc)).toBe(0);
  });

  it("returns 0 for document with no content", () => {
    const doc = { type: "doc" };
    expect(extractCreated(doc)).toBe(0);
  });

  it("returns 0 for null input", () => {
    expect(extractCreated(null)).toBe(0);
  });

  it("returns 0 for undefined input", () => {
    expect(extractCreated(undefined)).toBe(0);
  });

  it("returns 0 when created node has no attrs", () => {
    const doc = {
      type: "doc",
      content: [{ type: "title" }, { type: "created" }, { type: "paragraph" }],
    };
    expect(extractCreated(doc)).toBe(0);
  });

  it("returns 0 when created node has no timestamp attr", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title" },
        { type: "created", attrs: {} },
        { type: "paragraph" },
      ],
    };
    expect(extractCreated(doc)).toBe(0);
  });

  it("finds created node even if not in expected position", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "created", attrs: { timestamp: 1234567890 } },
        { type: "title" },
      ],
    };
    expect(extractCreated(doc)).toBe(1234567890);
  });
});

describe("createBlankDocument", () => {
  it("creates document with title, created, and paragraph nodes", () => {
    const timestamp = 1707350400000;
    const doc = createBlankDocument(timestamp) as {
      type: string;
      content: Array<{ type: string; attrs?: { timestamp?: number } }>;
    };

    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(3);
    expect(doc.content[0].type).toBe("title");
    expect(doc.content[1].type).toBe("created");
    expect(doc.content[1].attrs?.timestamp).toBe(timestamp);
    expect(doc.content[2].type).toBe("paragraph");
  });

  it("creates document that extractTitle returns Untitled for", () => {
    const doc = createBlankDocument(Date.now());
    expect(extractTitle(doc)).toBe("Untitled");
  });

  it("creates document that extractCreated returns correct timestamp for", () => {
    const timestamp = 1707350400000;
    const doc = createBlankDocument(timestamp);
    expect(extractCreated(doc)).toBe(timestamp);
  });

  it("works with timestamp of 0", () => {
    const doc = createBlankDocument(0);
    expect(extractCreated(doc)).toBe(0);
  });

  it("creates valid JSON structure", () => {
    const doc = createBlankDocument(Date.now());
    // Should be serializable to JSON and back without loss
    const serialized = JSON.stringify(doc);
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(doc);
  });
});

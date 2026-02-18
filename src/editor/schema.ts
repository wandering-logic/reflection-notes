import { Schema } from "prosemirror-model";
import { marks, nodes } from "prosemirror-schema-basic";
import { bulletList, listItem, orderedList } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";

/**
 * Validate that an href is safe for use in links.
 * Accepts http, https, and mailto URLs only.
 * Used by parseDOM for <a> tags and paste sanitization.
 */
export function isSafeHref(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

/**
 * Parse text as an HTTP(S) URL suitable for autolink.
 * Stricter than isSafeHref: only http/https with non-empty hostname.
 * Returns the parsed URL if valid, null otherwise.
 */
export function parseHttpUrl(text: string): URL | null {
  try {
    const url = new URL(text);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== ""
    ) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

// Generate table node specs from prosemirror-tables
// TODO: GFM has per-column alignment (left/center/right/none).
// Add `alignments: Alignment[]` attr to table node when we implement alignment UI.
// For now, all cells render left-aligned.
const tableNodeSpecs = tableNodes({
  tableGroup: "block",
  cellContent: "inline*", // GFM: cells contain inline content only
  cellAttributes: {},
});

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export const schema = new Schema({
  nodes: {
    doc: {
      content: "title created block+",
    },
    title: {
      // text_content excludes images (image is "inline" but not "text_content")
      content: "text_content*",
      parseDOM: [{ tag: "h1" }],
      toDOM() {
        return ["h1", 0];
      },
    },
    created: {
      attrs: { timestamp: { default: 0 } },
      atom: true,
      selectable: false,
      parseDOM: [
        {
          tag: "time.doc-created",
          getAttrs(dom) {
            const el = dom as HTMLElement;
            return { timestamp: parseInt(el.dataset.timestamp || "0", 10) };
          },
        },
      ],
      toDOM(node) {
        const ts = node.attrs.timestamp as number;
        const formatted = ts ? formatTimestamp(ts) : "";
        return [
          "time",
          {
            class: "doc-created",
            "data-timestamp": String(ts),
            datetime: ts ? new Date(ts).toISOString() : "",
          },
          formatted,
        ];
      },
    },
    // Paragraph must come first in block group to be the default
    paragraph: {
      ...nodes.paragraph,
      group: "block",
    },
    // Section headings: level 1=Section (h2), 2=Subsection (h3), 3=Subsubsection (h4)
    section: {
      attrs: { level: { default: 1, validate: "number" } },
      content: "inline*",
      group: "block",
      parseDOM: [
        { tag: "h2", attrs: { level: 1 } },
        { tag: "h3", attrs: { level: 2 } },
        { tag: "h4", attrs: { level: 3 } },
        { tag: "h5", attrs: { level: 4 } },
      ],
      toDOM(node) {
        return [`h${node.attrs.level + 1}`, 0];
      },
    },
    code_block: {
      ...nodes.code_block,
      group: "block",
    },
    blockquote: {
      ...nodes.blockquote,
      group: "block",
    },
    horizontal_rule: {
      ...nodes.horizontal_rule,
      group: "block",
    },
    math_display: {
      atom: true,
      attrs: {
        content: { default: "", validate: "string" },
      },
      group: "block",
      selectable: true,
      draggable: true,
      parseDOM: [
        {
          tag: "div.math-display",
          getAttrs(dom) {
            const el = dom as HTMLElement;
            return { content: el.getAttribute("data-latex") || "" };
          },
        },
      ],
      toDOM(node) {
        return [
          "div",
          {
            class: "math-display",
            "data-latex": node.attrs.content,
          },
        ];
      },
    },
    bullet_list: {
      ...bulletList,
      content: "list_item+",
      group: "block",
    },
    ordered_list: {
      ...orderedList,
      content: "list_item+",
      group: "block",
    },
    list_item: {
      ...listItem,
      content: "block+",
    },
    // Table nodes from prosemirror-tables
    table: tableNodeSpecs.table,
    table_row: tableNodeSpecs.table_row,
    table_cell: tableNodeSpecs.table_cell,
    table_header: tableNodeSpecs.table_header,
    // text is both "inline" and "text_content" (title allows text_content only)
    text: {
      ...nodes.text,
      group: "inline text_content",
    },
    image: {
      inline: true,
      atom: true,
      attrs: {
        src: { validate: "string" },
        alt: { default: null, validate: "string|null" },
        title: { default: null, validate: "string|null" },
      },
      group: "inline",
      draggable: true,
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs(dom) {
            const el = dom as HTMLElement;
            return {
              src: el.getAttribute("src"),
              alt: el.getAttribute("alt"),
              title: el.getAttribute("title"),
            };
          },
        },
      ],
      toDOM(node) {
        const { src, alt, title } = node.attrs;
        const attrs: Record<string, string> = { src, class: "pm-image" };
        if (alt) attrs.alt = alt;
        if (title) attrs.title = title;

        // If image has a link mark, wrap in <a>
        const linkMark = node.marks.find((m) => m.type.name === "link");
        if (linkMark) {
          return [
            "a",
            { href: linkMark.attrs.href, class: "pm-image-link" },
            ["img", attrs],
          ];
        }
        return ["img", attrs];
      },
    },
  },
  marks: {
    strong: marks.strong,
    em: marks.em,
    code: marks.code,
    link: {
      ...marks.link,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs(dom) {
            const href = (dom as HTMLElement).getAttribute("href") || "";
            if (!isSafeHref(href)) {
              return false; // Strip link, keep text
            }
            return {
              href,
              title: (dom as HTMLElement).getAttribute("title"),
            };
          },
        },
      ],
    },
    strikethrough: {
      parseDOM: [
        { tag: "s" },
        { tag: "del" },
        { tag: "strike" },
        { style: "text-decoration=line-through" },
      ],
      toDOM() {
        return ["s", 0];
      },
    },
  },
});

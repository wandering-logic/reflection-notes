import { Schema } from "prosemirror-model";
import { marks, nodes } from "prosemirror-schema-basic";
import {
  bulletList,
  listItem,
  orderedList,
} from "prosemirror-schema-list";

function formatTimestamp(ts: number): string {
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
      content: "inline*",
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
    text: nodes.text,
    // image: add later
  },
  marks: {
    strong: marks.strong,
    em: marks.em,
    code: marks.code,
    link: marks.link,
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

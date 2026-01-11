import { Schema } from "prosemirror-model";
import { marks, nodes } from "prosemirror-schema-basic";

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
      content: "title subtitle created block+",
    },
    title: {
      content: "inline*",
      marks: "",
      parseDOM: [{ tag: "h1" }],
      toDOM() {
        return ["h1", 0];
      },
    },
    subtitle: {
      content: "inline*",
      marks: "em",
      parseDOM: [{ tag: "h2" }],
      toDOM() {
        return ["h2", 0];
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
    // Section headings: level 1=Section (h3), 2=Subsection (h4), 3=Subsubsection (h5)
    section: {
      attrs: { level: { default: 1, validate: "number" } },
      content: "inline*",
      group: "block",
      parseDOM: [
        { tag: "h3", attrs: { level: 1 } },
        { tag: "h4", attrs: { level: 2 } },
        { tag: "h5", attrs: { level: 3 } },
      ],
      toDOM(node) {
        return [`h${node.attrs.level + 2}`, 0];
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
    text: nodes.text,
    // image: add later
    // bullet_list, ordered_list, list_item: add later
  },
  marks: {
    strong: marks.strong,
    em: marks.em,
    code: marks.code,
    link: marks.link,
    // strikethrough: add later
  },
});

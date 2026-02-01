# Schema Reference

This document maps the ProseMirror schema (`src/editor/schema.ts`) to CommonMark and GitHub Flavored Markdown (GFM) semantics.

## Document Structure

The schema defines a fixed document structure:

```
doc: title subtitle created block+
```

Every document has exactly one title, one subtitle, one created timestamp, followed by one or more blocks.

## Structural Grammar

The schema defines a context-free grammar. This section presents the production rules that determine what can contain what.

### Current Grammar

```
Document       <- Title Subtitle Created Block+

Block          <- LeafBlock | ContainerBlock

LeafBlock      <- Paragraph | Section | CodeBlock | HorizontalRule
ContainerBlock <- Blockquote

Paragraph      <- Inline*
Section        <- Inline*                    ; level ∈ {1,2,3,4}
CodeBlock      <- Text*                      ; marks forbidden
HorizontalRule <- ε                          ; atomic

Blockquote     <- Block+                     ; recursive

Inline         <- Text
Text           <- (char, Mark*)*

Mark           <- Strong | Em | Code | Link | Strikethrough
```

### Structural Gaps (vs CommonMark)

**1. Document has a fixed prefix**

CommonMark: `Document <- Block*`
This schema: `Document <- Title Subtitle Created Block+`

The fixed prefix is intentional (app-specific metadata), but it means documents cannot start with arbitrary content.

**2. Lists are missing**

No recursive nesting structure exists beyond blockquotes. Lists enable the primary nesting pattern in CommonMark:

```
; CommonMark structure (missing):
ContainerBlock <- Blockquote | BulletList | OrderedList

BulletList     <- ListItem+
OrderedList    <- ListItem+                  ; start attr
ListItem       <- Block+                     ; enables arbitrary nesting
```

Without lists, users cannot create nested outlines or hierarchical content.

**3. Inline nodes are impoverished**

Only `Text` exists as an inline node. CommonMark has:

```
; CommonMark inline nodes (partially missing):
Inline <- Text | Image | HardBreak | SoftBreak

Image     <- ε                               ; atomic, with src/alt/title attrs
HardBreak <- ε                               ; atomic, explicit line break
```

The schema uses marks for emphasis/strong/code/link, which is a valid ProseMirror pattern but structurally different from CommonMark's inline span model.

**4. No tight/loose list distinction**

CommonMark distinguishes "tight" lists (no blank lines between items, rendered without `<p>` wrappers) from "loose" lists. This requires list support first.

## Nodes

### App-Specific Nodes

These nodes are specific to the notebook application and don't correspond to CommonMark elements:

| Node | HTML | Content | Marks | Purpose |
|------|------|---------|-------|---------|
| `title` | `<h1>` | `inline*` | none | Note title (unformatted) |
| `subtitle` | `<h2>` | `inline*` | `em` only | Note subtitle (italic allowed) |
| `created` | `<time>` | atom | — | Creation timestamp |

### Block Nodes

| Node | HTML | Group | Content | Source |
|------|------|-------|---------|--------|
| `paragraph` | `<p>` | block | `inline*` | prosemirror-schema-basic |
| `section` | `<h3>`–`<h6>` | block | `inline*` | Custom (level 1–4) |
| `code_block` | `<pre>` | block | `text*` | prosemirror-schema-basic |
| `blockquote` | `<blockquote>` | block | `block+` | prosemirror-schema-basic |
| `horizontal_rule` | `<hr>` | block | empty | prosemirror-schema-basic |

### Inline Nodes

| Node | HTML | Source |
|------|------|--------|
| `text` | — | prosemirror-schema-basic |

## Marks

| Mark | HTML | Source |
|------|------|--------|
| `strong` | `<strong>` | prosemirror-schema-basic |
| `em` | `<em>` | prosemirror-schema-basic |
| `code` | `<code>` | prosemirror-schema-basic |
| `link` | `<a>` | prosemirror-schema-basic |
| `strikethrough` | `<s>` | Custom (GFM extension) |

## CommonMark Coverage

Reference: [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)

### Leaf Blocks

| CommonMark | Schema | Status |
|------------|--------|--------|
| Thematic break | `horizontal_rule` | Implemented |
| ATX heading | `section` | Partial (h3–h6 only; h1–h2 reserved for title/subtitle) |
| Setext heading | — | Not needed (ATX sufficient) |
| Indented code block | `code_block` | Implemented |
| Fenced code block | `code_block` | Implemented |
| Paragraph | `paragraph` | Implemented |

### Container Blocks

| CommonMark | Schema | Status |
|------------|--------|--------|
| Block quote | `blockquote` | Implemented |
| List item | — | **Missing** (needs prosemirror-schema-list) |
| Bullet list | — | **Missing** (needs prosemirror-schema-list) |
| Ordered list | — | **Missing** (needs prosemirror-schema-list) |

### Inlines

| CommonMark | Schema | Status |
|------------|--------|--------|
| Code span | `code` mark | Implemented |
| Emphasis | `em` mark | Implemented |
| Strong emphasis | `strong` mark | Implemented |
| Link | `link` mark | Implemented |
| Image | — | **Missing** (available in prosemirror-schema-basic) |
| Hard line break | — | **Missing** (available in prosemirror-schema-basic) |
| Soft line break | text | Handled as whitespace |

### Not Applicable

- **Link reference definitions**: Parser concern, not schema
- **Raw HTML**: Intentionally excluded for security
- **Autolinks**: Parser concern, represented as `link` mark

## GFM Extensions

Reference: [GitHub Flavored Markdown](https://github.github.com/gfm/)

| Extension | Schema | Status |
|-----------|--------|--------|
| Strikethrough | `strikethrough` mark | Implemented |
| Tables | — | **Missing** (would need custom nodes) |
| Task lists | — | **Missing** (would need list support first) |
| Autolinks (extended) | — | Parser concern |

## Inline Content Restrictions

Different node types restrict which marks can appear within them:

| Node | Allowed Marks | Rationale |
|------|---------------|-----------|
| `title` | none | Titles should be plain text for indexing/display |
| `subtitle` | `em` | Subtle formatting only |
| `section` | all | Full formatting in section headings |
| `paragraph` | all | Full formatting |
| `blockquote` | all (via contained blocks) | Inherits from content |
| `code_block` | none | Code is literal |

## Missing Features Summary

Priority items for CommonMark compliance:

1. **Lists** (`bullet_list`, `ordered_list`, `list_item`) — Requires adding prosemirror-schema-list
2. **Images** (`image`) — Available in prosemirror-schema-basic, commented out in schema
3. **Hard line breaks** (`hard_break`) — Available in prosemirror-schema-basic

Optional GFM extensions:

4. **Tables** — Would require custom schema nodes
5. **Task lists** — Requires list support plus checkbox handling

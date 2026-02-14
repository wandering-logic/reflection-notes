# Schema Reference

The schema is defined in (`src/editor/schema.ts`).  The semantics are
influenced by [the CommonMark spec](https://spec.commonmark.org/0.31.2/), and
the strikethrough and table semantics come from [Github flavored
Markdown](https://github.github.com/gfm/).  These in turn were, I think heavily
influenced by the tree structure of html.

## Document Structure

The schema defines a fixed document structure:

```
doc: title created labels block+
```

Every document has exactly one title, and some metadata (timestamp, labels),
followed by one or more blocks.

## Desired Grammar

```
Document       <- Title Created Labels Block+

Title          <- Inline*                  ; h1
Created        <- immutable date
Labels         <- Label*
Label          <- Text

Block          <- LeafBlock | ContainerBlock

LeafBlock      <- Paragraph | Section | CodeBlock | MathDisplay | HorizontalRule | Table

ContainerBlock <- Blockquote | List

Paragraph      <- Inline*
Section        <- Inline*                    ; level ∈ {2, 3, 4, 5}
CodeBlock      <- Text*                      ; marks forbidden
HorizontalRule <- ε                          ; atomic

Table          <- TableRow+                  ; alignments: Alignment* (one per column)
                                             ; first row is the header row
TableRow       <- TableCell+
TableCell      <- Inline*

Alignment      <- "left" | "center" | "right" | "none"

Blockquote     <- Block+                     ; recursive

List           <- ListItem+                  ; lists can be "ordered" or "unordered"

ListItem       <- Block+                     ; markdown and html have notions of tight and loose we
                                             ; basically just have "loose" (listitems contain blocks)

Inline         <- Text | MathInline
Text           <- (char, Mark*)*

Mark           <- Strong | Em | Code | Link | Strikethrough ; this is not tree structured, but is what ProseMirror advocates

MathInline     <- LaTeXSource          ; inline atom node
MathDisplay    <- LaTeXSource          ; block atom node
LaTeXSource    <- text*                ; marks forbidden

Image          <- src, alt?, title?    ; inline atom node
                                       ; src: relative path (string)
                                       ; alt: plain text (string)
                                       ; title: plain text (string)

```

## Table Semantics (Context-Sensitive Rules)

Tables follow [GFM table semantics](https://github.github.com/gfm/#tables-extension-).
These rules cannot be expressed in the grammar but are part of the schema:

1. **Column count is defined by header row** - The number of cells in the first
   row defines the table's column count. The `alignments` array length MUST
   equal the column count.

2. **All rows SHOULD have uniform column count** - Rows with fewer cells are
   logically padded with empty cells. Rows with more cells have excess ignored
   on export. Editors SHOULD normalize rows to uniform count.

3. **Header row is positional** - The first row is always the header row; this
   is not a cell-level property. If the first row is deleted, the next row
   becomes the header.

4. **Alignment applies per-column, not per-cell** - All cells in column N use
   `alignments[N]`. Individual cell alignment overrides are not supported.

5. **Default alignment** - The `alignments` array always has length equal to
   column count. Columns with no explicit alignment store `"none"` (rendered
   as left-aligned, per GFM).


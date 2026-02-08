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

LeafBlock      <- Paragraph | Section | CodeBlock | MathDisplay | HorizontalRule
ContainerBlock <- Blockquote | List

Paragraph      <- Inline*
Section        <- Inline*                    ; level ∈ {2, 3, 4, 5}
CodeBlock      <- Text*                      ; marks forbidden
HorizontalRule <- ε                          ; atomic

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


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

Title          <- Inline*
Created        <- immutable date
Labels         <- Label*
Label          <- Text

Block          <- LeafBlock | ContainerBlock

LeafBlock      <- Paragraph | Section | CodeBlock | HorizontalRule
ContainerBlock <- Blockquote | List

Paragraph      <- Inline*
Section        <- Inline*                    ; level ∈ {1,2,3,4}
CodeBlock      <- Text*                      ; marks forbidden
HorizontalRule <- ε                          ; atomic

Blockquote     <- Block+                     ; recursive

List           <- ListItem+                  ; lists can be "ordered" or "unordered"

ListItem       <- Block+                     ; markdown and html have notions of tight and loose we
                                             ; basically just have "loose" (listitems contain blocks)

Inline         <- Text
Text           <- (char, Mark*)*

Mark           <- Strong | Em | Code | Link | Strikethrough ; this is not tree structured, but is what ProseMirror advocates
```


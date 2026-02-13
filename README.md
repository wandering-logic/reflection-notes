# [Reflection Notes](https://reflection-notes.wanderinglogic.com/) - a Semantic Notebook webapp

A WYSIWYG editor for people who think in Markdown but would prefer less friction for images, links, math and tables.

The app is served at https://reflection-notes.wanderinglogic.com/, and would
not be possible without the excellent [ProseMirror
toolkit](https://prosemirror.net/).

## Guiding Principles

These principles guide design decisions:

1. **Keyboard-first** — Like vim or emacs, hands stay on the keyboard as much as possible.

2. **Markdown-compatible** — The schema stays grammatically similar to GitHub Flavored Markdown. No features that can't round-trip through GFM. Import and export without information loss.

3. **Offline-first** — Works without a network connection. Cloud sync is for convenience, not dependency.

4. **Open format** — File format is documented and human-readable. No proprietary lock-in.

5. **Portable** — Runs anywhere with a modern browser (PWA). Data can move between platforms.

6. **Scratching my own itch** — Built for my personal workflow.  I hope others like it.

## File Format

Each note is a subdirectory containing ProseMirror JSON plus assets (images). A notebook is a directory hierarchy of notes with top-level metadata.

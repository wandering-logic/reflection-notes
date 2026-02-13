# [Reflection Notes](https://reflection-notes.wanderinglogic.com/) - a semantic notebook app

A semantic notebook for writing-to-learn, focused on keyboard flow, math, open
formats, and offline use or provider-agnostic distributed sync.

The app is served at https://reflection-notes.wanderinglogic.com/, and would
not be possible without the excellent [ProseMirror
toolkit](https://prosemirror.net/).

## Guiding Principles

These principles guide design decisions:

1. **Keyboard-first** — Like vim or emacs, hands stay on the keyboard as much
   as possible.

2. **Markdown-compatible** — The schema stays grammatically similar to GitHub
   Flavored Markdown. Import and export without information loss.

3. **Excellent Math Support**

4. **Offline-first** — Works without a network connection. Cloud sync for
   sharing between devices when online.

5. **Open format** — File format is documented and human-readable. No
   proprietary lock-in.

6. **Portable** — Runs anywhere with a modern browser (PWA). Data can move
   between platforms.

7. **Opinionated** — Built for my personal workflow.  I hope others with
   similar needs find it useful.

## File Format

Each note is a subdirectory containing ProseMirror JSON plus assets (images). A
notebook is a directory hierarchy of notes with top-level metadata.

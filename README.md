# [Reflection Notes](https://reflection-notes.wanderinglogic.com/) - a Semantic Notebook webapp

The app is served through github pages at https://reflection-notes.wanderinglogic.com/.
Please try it out and let me know what you think!

This will hopefully eventually be a full progressive web app that supports
editing rich text documents with semantic structure (paragraphs, headings,
quotes, code, lists, strong, emph, links, images, strikethrough) plus math
(with KaTex) and tables (maybe eventually footnotes.

The motivation is that I want something that is similarly functional to the
OneNote PWA, but with better math support, an open file format, and excellent
export of static html (for publication on (for example) a blog).

The [ProseMirror toolkit](https://prosemirror.net/) is doing almost all the
heavy lifting here.  It's truly a wonderful library.

The file format will is: each note is a subdirectory containing a ProseMirror
json and additional assets (images).  A "notebook" will simply be a directory
hierarchy of notes (with some top level indices eventually and some shared
assets (like user-provided style sheets).

Near term I'll support syncing to local file system.  Longer term the plan is
to sync to DropBox or Box or OneDrive or Google Drive (or Github?) for mobile
support.

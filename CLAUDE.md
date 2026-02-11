# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Type-check with tsc, then bundle with Vite
npm run preview    # Preview production build
npm run lint       # Check with Biome (linting + formatting)
npm run lint:fix   # Auto-fix Biome issues
npm test           # Run unit tests once
npm run test:watch # Run tests in watch mode
```

**When to run tests:** Run `npm test` after modifying any functions in `src/storage/` or `src/editor/`. Tests cover pure functions like `extractTitle`, `parseDataUrl`, `categorizeImageSrc`, etc. The test suite runs in ~200ms.

## Project Vision

A PWA semantic notebook editor (like OneNote but with better math support, open file format, and clean HTML export). See README.md for details.

**File format**: Each note is a directory containing `note.json` (ProseMirror JSON) + assets. Notebooks are directories with `notebook.json` metadata. See Storage Architecture below.

## Architecture

This is a rich text editor application built on ProseMirror. The editor uses ProseMirror's plugin architecture for state management, undo/redo history, and keyboard shortcuts.

**Key files:**
- `src/main.ts` - Application entry point, UI shell, file menu handlers
- `src/editor/editor.ts` - ProseMirror editor initialization and commands
- `src/editor/schema.ts` - Document schema (title, created, sections, etc.)
- `src/storage/filesystem.ts` - FileSystemProvider interface + local implementation
- `src/storage/notebook.ts` - Notebook operations
- `src/storage/note.ts` - Note operations

**Editor stack:**
- `prosemirror-state` for editor state
- `prosemirror-view` for rendering
- `prosemirror-model` with `prosemirror-schema-basic` for document structure
- `prosemirror-history` for undo/redo
- `prosemirror-keymap` + `prosemirror-commands` for keyboard shortcuts

**Toolbar icons:**
- Inlined SVGs from Tabler Icons (tabler.io/icons, MIT license)
- Icon names documented in HTML comment at line 126 of `src/main.ts`
- One exception: `tb-h1` uses a custom seriffed "H" (Tabler's `h-1` includes the digit)

## Storage Architecture

**Terminology:**
- **Notebook**: A collection of notes stored in a user-chosen directory. The app always has one notebook open.
- **Note**: A single document within a notebook, stored as ProseMirror JSON.

**File structure:**
```
MyNotebook/                      # User-chosen directory (name = notebook name)
├── notebook.json                # { version, lastOpenedNote }
└── 2026/01/26/1/                # Note path: yyyy/mm/dd/n
    └── note.json                # ProseMirror document (contains title, created timestamp)
```

The `yyyy/mm/dd/n` directory structure is an implementation detail to avoid huge flat directories. Users identify notes by title, not path.

**Design decisions:**
- `FileSystemProvider` interface abstracts file operations. Currently implemented for File System Access API, designed to support cloud providers (Box, Dropbox, OneDrive, Google Drive) later.
- Future: OPFS will serve as a cache layer that syncs with the "real" file system.
- No note index for MVP - notes are scanned on demand. Index can be added to `notebook.json` later for performance.
- Note title is extracted from the ProseMirror document's first node (the `title` node), not stored redundantly.

## Build Output Layout

Standard Vite PWA layout with the app at root:

```
dist/
├── index.html          # The app
├── manifest.webmanifest
├── sw.js
├── icon-*.png, favicon.svg
├── CNAME
└── assets/
    └── *.js, *.css
```

Verify with `npm run build && npm run preview` → http://localhost:4173/

## TypeScript

Strict mode is enabled. The build runs `tsc` for type-checking before Vite bundles the output. CI validates both type-checking and build on every push/PR.

## Node Version

Use Node v24.12.0 (specified in `.nvmrc`).

## GitHub CLI

Always use `--json` with `gh issue view` to avoid GraphQL deprecation errors:

```bash
gh issue view 17 --json title,body,state   # correct
gh issue view 17                            # errors on projectCards field
```

## Browser Clipboard API Limitations

The Async Clipboard API (`navigator.clipboard.write()`) only supports three MIME types:
- `text/plain`
- `text/html`
- `image/png`

**No JPEG, GIF, or other image formats.** Images must be converted to PNG before writing to clipboard for external apps (GIMP, etc.) to read them. This is a W3C spec limitation, not a browser bug.

Additionally, when creating Blobs from binary data (e.g., loading images from filesystem), you must explicitly set the MIME type - it won't be inferred:
```typescript
// Wrong - blob.type will be empty string
new Blob([data])

// Correct - derive type from file extension
new Blob([data], { type: "image/jpeg" })
```

## Planning Complex Features

Before designing solutions, enumerate the complete problem space:

1. **What happens today?** Trace the actual mechanism - don't assume. For I/O features (clipboard, file save/load, network), map both directions together.

2. **Enumerate all cases.** List every input variant, output variant, and the cross-product of scenarios. Ask: "What bytes/data actually flow through the system in each case?"

3. **Identify the coupling.** Features that seem separate often share a communication channel (clipboard, file format, API). Design them together, not as afterthoughts to each other.

Only after this enumeration should you design the implementation.

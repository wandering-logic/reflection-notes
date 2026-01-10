# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check with tsc, then bundle with Vite
npm run preview   # Preview production build
npm run lint      # Check with Biome (linting + formatting)
npm run lint:fix  # Auto-fix Biome issues
```

## Project Vision

A PWA semantic notebook editor (like OneNote but with better math support, open file format, and clean HTML export). See README.md for details.

**File format**: Each note is a directory containing ProseMirror JSON + assets. Notebooks are directory hierarchies.

## Architecture

This is a rich text editor application built on ProseMirror. The editor uses ProseMirror's plugin architecture for state management, undo/redo history, and keyboard shortcuts.

**Key files:**
- `src/main.ts` - Application entry point, creates the UI shell (menubar, sidebar, editor container)
- `src/editor/editor.ts` - ProseMirror editor initialization, exports `undo()` and `redo()` functions
- `src/style.css` - All application styles including layout grid, menubar, and editor styling

**Editor stack:**
- `prosemirror-state` for editor state
- `prosemirror-view` for rendering
- `prosemirror-model` with `prosemirror-schema-basic` for document structure
- `prosemirror-history` for undo/redo
- `prosemirror-keymap` + `prosemirror-commands` for keyboard shortcuts

## TypeScript

Strict mode is enabled. The build runs `tsc` for type-checking before Vite bundles the output. CI validates both type-checking and build on every push/PR.

## Node Version

Use Node v24.12.0 (specified in `.nvmrc`).

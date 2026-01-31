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

**File format**: Each entry is a directory containing `entry.json` (ProseMirror JSON) + assets. Commonbooks are directories with `commonbook.json` metadata. See Storage Architecture below.

## Architecture

This is a rich text editor application built on ProseMirror. The editor uses ProseMirror's plugin architecture for state management, undo/redo history, and keyboard shortcuts.

**Key files:**
- `src/main.ts` - Application entry point, UI shell, file menu handlers
- `src/editor/editor.ts` - ProseMirror editor initialization and commands
- `src/editor/schema.ts` - Document schema (title, subtitle, created, sections, etc.)
- `src/storage/filesystem.ts` - FileSystemProvider interface + local implementation
- `src/storage/commonbook.ts` - Commonbook operations
- `src/storage/entry.ts` - Entry operations

**Editor stack:**
- `prosemirror-state` for editor state
- `prosemirror-view` for rendering
- `prosemirror-model` with `prosemirror-schema-basic` for document structure
- `prosemirror-history` for undo/redo
- `prosemirror-keymap` + `prosemirror-commands` for keyboard shortcuts

## Storage Architecture

**Terminology:**
- **Commonbook**: A collection of entries stored in a user-chosen directory. The app always has one commonbook open.
- **Entry**: A single document within a commonbook, stored as ProseMirror JSON.

**File structure:**
```
MyCommonbook/                    # User-chosen directory (name = commonbook name)
├── commonbook.json              # { version, lastOpenedEntry }
└── 2026/01/26/1/                # Entry path: yyyy/mm/dd/n
    └── entry.json               # ProseMirror document (contains title, created timestamp)
```

The `yyyy/mm/dd/n` directory structure is an implementation detail to avoid huge flat directories. Users identify entries by title, not path.

**Design decisions:**
- `FileSystemProvider` interface abstracts file operations. Currently implemented for File System Access API, designed to support cloud providers (Box, Dropbox, OneDrive, Google Drive) later.
- Future: OPFS will serve as a cache layer that syncs with the "real" file system.
- No entry index for MVP - entries are scanned on demand. Index can be added to `commonbook.json` later for performance.
- Entry title is extracted from the ProseMirror document's first node (the `title` node), not stored redundantly.

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

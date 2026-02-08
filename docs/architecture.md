# Architecture

This document describes the overall structure of the application, how it uses
ProseMirror, and how data flows through the system.

For ProseMirror's own architecture, see the [ProseMirror
Guide](https://prosemirror.net/docs/guide/).

## Module Structure

```
src/
├── main.ts                 # Application shell and orchestration
├── editor/
│   ├── schema.ts           # ProseMirror schema (see docs/schema.md)
│   ├── editor.ts           # ProseMirror setup, keymaps, commands
│   └── imageNodeView.ts    # Custom rendering for image nodes
└── storage/
    ├── filesystem.ts       # FileSystemProvider abstraction
    ├── notebook.ts         # Notebook operations
    ├── note.ts             # Note operations
    └── image.ts            # Image file operations
```

### main.ts — The Orchestrator

`main.ts` is the application shell. It connects components (the editor and
storage systems) and responds to user actions.

Responsibilities:
- Application startup and state restoration
- Menu and toolbar event handlers
- Dialog management (welcome, note picker, reconnect)
- Autosave coordination
- Glue between editor and storage layers

Global state held in main.ts:
- `currentNotebook: Notebook | null`
- `currentNote: Note | null`
- `view: EditorView` (the ProseMirror instance)
- `fs: FileSystemProvider`

### editor/ — ProseMirror Integration

The editor layer wraps ProseMirror. It knows about rich text, formatting
commands, and keyboard shortcuts. It does not know about files or storage.

**schema.ts**: Defines the document grammar. See `docs/schema.md` for
rationale.

**editor.ts**: Creates and configures the EditorView. Includes:
- Keymap plugins (formatting, navigation, lists)
- History plugin (undo/redo)
- Paste handling (text, HTML, images)
- Commands exposed to main.ts (toggleBold, setHeading, etc.)

**imageNodeView.ts**: Custom NodeView for image nodes. Images are stored as
relative paths but must be rendered as blob URLs (see "Image Rendering" below).

### storage/ — File System Abstraction

The storage layer handles persistence.

**filesystem.ts**: Defines `FileSystemProvider` interface. Currently implemented
for the File System Access API. Designed to support cloud providers later.

**notebook.ts / note.ts**: CRUD operations for notebooks and notes.

**image.ts**: Image file operations (save, filename generation).

## Storage Model (Brief)

> Note: This will change soon to add versioning, caching and atomicity for
  cloud sync and conflict merging of offline versions.

```
NotebookDirectory/              # User-chosen directory
├── notebook.json               # { version, lastOpenedNote }
└── yyyy/mm/dd/n/               # Note path
    ├── note.json               # ProseMirror document JSON
    └── *.png, *.jpg, *.gif     # Image assets
```

- Notebooks are directories containing notes
- Notes are directories containing `note.json` plus assets
- The `yyyy/mm/dd/n` structure avoids flat directories with many files
- Note titles are extracted from the document, not stored redundantly

## Data Flow: Load → Edit → Save

### Loading a Note

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. User action (startup, open note, open notebook)                       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. main.ts: loadNote(fs, notebook, path)                                 │
│    - Reads note.json from disk                                           │
│    - Returns { path, content } where content is ProseMirror JSON         │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. main.ts: Editor.setContent(view, content)                             │
│    - Parses JSON into ProseMirror Node tree                              │
│    - Creates new EditorState                                             │
│    - View renders document to DOM                                        │
│    - NodeViews created for custom nodes (images)                         │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. main.ts: loadImageBlobUrls()                                          │
│    - Walks document to find image nodes                                  │
│    - Reads each image file from disk                                     │
│    - Creates blob URLs                                                   │
│    - Stores in lookup map for NodeViews                                  │
│    (⚠ Currently has ordering bug—NodeViews created before URLs ready)   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Editing

ProseMirror handles all editing through its transaction system:

```
User input (typing, paste, toolbar click)
         │
         ▼
┌─────────────────────┐
│ EditorView receives │
│ DOM event           │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Event converted to  │
│ Transaction (tr)    │
│                     │
│ tr describes the    │
│ change declaratively│
└─────────────────────┘
         │
         │ view.dispatch(tr)
         ▼
┌─────────────────────┐
│ New EditorState     │
│ created (immutable) │
│                     │
│ Old state unchanged │
└─────────────────────┘
         │
         │ view.updateState()
         ▼
┌─────────────────────┐
│ View diffs old/new  │
│ Updates DOM minimal │
└─────────────────────┘
```

Key insight: State is never mutated. Each edit creates a new state. The view
efficiently updates only the changed parts of the DOM.

### Saving a Note

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. Trigger: autosave interval, blur, or explicit save                    │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. main.ts: saveCurrentNote()                                            │
│    - Gets current document: view.state.doc                               │
│    - Serializes to JSON: doc.toJSON()                                    │
│    - Updates currentNote.content                                         │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. storage: saveNote(fs, notebook, note)                                 │
│    - Writes JSON to note.json                                            │
│    - Image files already saved at paste time                             │
└──────────────────────────────────────────────────────────────────────────┘
```

## Image Rendering

Images present a special challenge because of browser security:

- **Storage**: Images are files on disk with relative paths (e.g., `01ABC-photo.png`)
- **Rendering**: Browsers cannot load arbitrary file paths in `<img src="...">`
- **Solution**: Load file into memory, create a blob URL (`blob:http://...`)

Current implementation uses a lookup map:
```
relativePath → blobUrl
"01ABC-photo.png" → "blob:http://localhost:5173/xyz-789"
```

NodeViews look up the blob URL when rendering. This creates lifecycle
challenges (when to create/revoke blob URLs) and ordering issues (URLs must
exist before NodeViews try to use them).

See open issue: image blob URLs not loaded correctly on page reload.

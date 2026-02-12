# Architecture Overview

This document explains the application architecture for someone familiar with distributed systems and state machines but less familiar with browser-based UIs.

## 1. The Browser Event Model

The browser runs a **single-threaded event loop**. Think of it like a game loop or Node.js's event loop:

```
while (true) {
    event = dequeue_next_event()   // keyboard, mouse, timer, network...
    handler = lookup_handler(event)
    handler(event)
}
```

**How events are registered:**
```javascript
element.addEventListener("click", (event) => { ... })
```

This registers a callback for "click" events on a specific DOM element. The browser's event loop calls these handlers when matching events occur.

**Event bubbling:** Events propagate up the DOM tree. A click on a button also triggers click handlers on its parent div, then the body, etc. Handlers can call `event.stopPropagation()` to halt this.

In this app:
- **Keyboard events inside the editor** are captured by ProseMirror (which registers its own listeners on the editor container)
- **Mouse clicks on toolbar/menu elements** are handled by explicit `addEventListener` calls in `main.ts`

## 2. ProseMirror: The Core Abstraction

ProseMirror is a rich-text editor framework. It handles the hard parts: cursor management, selection, text rendering, undo/redo, copy/paste. Here's how it works, using familiar terms:

### Immutable State Model

`EditorState` is like a Git commit snapshot. It's never mutated - only replaced:

```typescript
EditorState {
    doc: Node              // The document tree (immutable)
    selection: Selection   // Cursor position or selected range
    storedMarks: Mark[]    // Formatting to apply at cursor
    plugins: Plugin[]      // Behavior extensions
    schema: Schema         // Grammar for valid document structure
}
```

### Transactions (Atomic Updates)

A `Transaction` describes a proposed change:

```typescript
const tr = state.tr                    // Start a transaction
    .insertText("hello")               // Queue an insertion
    .addMark(0, 5, schema.marks.bold)  // Queue a formatting change

const newState = state.apply(tr)       // Apply atomically -> new state
view.updateState(newState)             // Update the view
```

Transactions are conceptually similar to database transactions: they describe changes that are applied atomically. You can't partially apply a transaction.

### The Update Cycle

```
User Action → Transaction → state.apply(tr) → newState → view.updateState() → DOM updated
```

This is always synchronous. ProseMirror efficiently diffs the old and new state to update only the changed DOM nodes.

### Plugins (Middleware)

Plugins intercept events and produce transactions. They're like middleware in an HTTP framework:

```
Event → Plugin 1 → Plugin 2 → ... → Transaction → State
```

Each plugin can:
- Transform events into transactions (keymaps)
- Observe transactions (history tracking)
- Add decorations (placeholder text, highlights)

### Keymaps (Key Binding Tables)

Keymaps are plugins that map key combinations to "commands":

```typescript
const markKeymap = keymap({
    "Mod-b": toggleMark(schema.marks.strong),  // Ctrl/Cmd+B → toggle bold
    "Mod-i": toggleMark(schema.marks.em),      // Ctrl/Cmd+I → toggle italic
})
```

A command is a function `(state, dispatch?) => boolean`. If it returns true, the event is consumed. The `dispatch` callback receives the transaction to apply.

### The Schema (Document Grammar)

The schema defines valid document structure, like a DTD or JSON Schema:

```typescript
schema = new Schema({
    nodes: {
        doc: { content: "title created block+" },  // One title, one created, then blocks
        title: { content: "inline*" },             // Title contains inline content
        paragraph: { content: "inline*", group: "block" },
        section: { attrs: { level: { default: 1 } }, content: "inline*", group: "block" },
        // ...
    },
    marks: {
        strong: { ... },  // Bold
        em: { ... },      // Italic
        // ...
    }
})
```

The `content` expressions work like regex: `"block+"` means "one or more blocks".

## 3. Three-Layer State Architecture

This application manages state at three distinct layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Application State  (src/appState.ts)              │
│  - Which notebook/note is currently open                    │
│  - Pure state machine with explicit transitions             │
│  - States: welcome | reconnecting | loaded                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Autosave State  (src/autosave.ts)                 │
│  - Debounce state machine for batching saves                │
│  - States: IDLE → COUNTING → SAVING                         │
│  - Handles edits during save (SAVING_PENDING)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Document State  (ProseMirror EditorState)         │
│  - The actual note content                                  │
│  - Selection/cursor position                                │
│  - Undo/redo history (via history plugin)                   │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Application State

A discriminated union with pure transition functions (`src/appState.ts:18-90`):

```typescript
type AppState =
    | { kind: "welcome" }
    | { kind: "reconnecting"; handle: FileSystemDirectoryHandle; notebookName: string }
    | { kind: "loaded"; notebook: Notebook; note: Note }

function transition(state: AppState, event: AppEvent): AppState | null {
    // Pure function - returns new state or null if transition invalid
}
```

State is never mutated directly. Transitions are requested:
```typescript
const newState = transition(appState, { type: "switch_note", note })
if (newState) appState = newState
```

### Layer 2: Autosave State

Another explicit state machine (`src/autosave.ts:17`):

```
IDLE ──[schedule()]──→ COUNTING ──[timer fires]──→ SAVING ──[complete]──→ IDLE
                           │                          │
                           │                    [schedule() called]
                           │                          │
                           │                          ▼
                           │                   SAVING_PENDING
                           │                          │
                           │                    [save completes]
                           └──────────────────────────┘
```

This ensures rapid edits are batched and that edits during a save trigger a follow-up save.

### Layer 3: Document State

ProseMirror manages this. The key insight: **you don't write to this layer directly**. You dispatch transactions and ProseMirror applies them:

```typescript
// DON'T: view.state.doc = newDoc  // This doesn't exist
// DO:    view.dispatch(tr)         // Let ProseMirror handle it
```

## 4. Data Flow: Keystroke to Disk

Complete trace of typing a character:

```
1. User presses "A" key

2. Browser event loop delivers KeyboardEvent to editor container

3. ProseMirror's internal handler:
   - Checks keymaps (no match for "A")
   - Falls through to default text input handling
   - Creates transaction: tr.insertText("A")
   - Calls dispatchTransaction(tr)

4. dispatchTransaction callback (src/editor/editor.ts:288-306):
   const newState = view.state.apply(tr)   // Immutable state update
   view.updateState(newState)               // Re-render changed DOM

5. If tr.docChanged, fire change listeners:
   - autosaveManager.schedule()            // Debounce timer starts

6. If tr.selectionSet || tr.docChanged, fire selection listeners:
   - updateToolbarState()                  // Toggle button highlights
   - updateFormatIndicator()               // Update "Paragraph" indicator

7. After 1000ms idle, autosaveManager timer fires:
   - State: COUNTING → SAVING
   - saveCurrentNote() called
   - note.content = view.state.doc.toJSON()
   - saveNote(fs, notebook, note)
   - fs.writeTextFile(handle, path, JSON.stringify(content))
   - File System Access API writes to disk
   - State: SAVING → IDLE
```

## 5. Module Responsibilities

| Module | Responsibility | State Owned |
|--------|---------------|-------------|
| `src/main.ts` | Orchestration, UI shell, event wiring | appState variable |
| `src/editor/editor.ts` | ProseMirror setup, command functions | Listener registrations |
| `src/editor/schema.ts` | Document grammar (node/mark types) | None (pure definition) |
| `src/storage/*.ts` | File I/O abstraction | None (stateless functions) |
| `src/autosave.ts` | Save debouncing state machine | AutosaveManager instance |
| `src/appState.ts` | Session state machine | Pure functions (state stored in main.ts) |

## 6. The DOM Relationship

### Who Owns What

**ProseMirror owns the editor DOM:** The `<div id="editor">` element and everything inside it is rendered and managed by `EditorView`. You don't manipulate this DOM directly.

**We own everything else:** Toolbar, menus, dialogs, status bar. These are manipulated with standard DOM APIs in `main.ts`.

### NodeViews (Custom Rendering)

For complex elements like images, ProseMirror calls a **NodeView** factory that returns render/update functions:

```typescript
function createImageNodeView(node, view, getPos) {
    const img = document.createElement("img")

    return {
        dom: img,

        update(newNode) {
            // Called when document updates - sync DOM with new state
            img.src = resolveSrc(newNode.attrs.src)
            return true  // We handled this update
        },

        destroy() {
            // Cleanup (revoke blob URLs, etc.)
        }
    }
}
```

This is how images can show loading states, resolve relative paths to blob URLs, etc.

## 7. Where Event Handlers Live

### Keyboard Shortcuts
- `src/editor/editor.ts:137-142` - markKeymap (Ctrl+B, Ctrl+I, etc.)
- `src/editor/editor.ts:200-203` - navigationKeymap (Tab between title/body)
- `src/editor/editor.ts:207-211` - listKeymap (Enter, Tab in lists)
- `src/editor/editor.ts:242` - baseKeymap (Delete, Backspace, etc.)

### Toolbar/Menu Clicks
- `src/main.ts:277-373` - Format menu items
- `src/main.ts:375-464` - Toolbar buttons
- `src/main.ts:747-774` - File menu items

### Document Change Handling
- `src/editor/editor.ts:288-306` - dispatchTransaction callback
- `src/main.ts:863-867` - onChange listener (triggers autosave)
- `src/main.ts:927-932` - onSelectionChange listener (updates toolbar state)

### Paste Handling
- `src/editor/editor.ts:312-562` - handlePaste plugin hook
  - File pastes (raw image data)
  - HTML pastes with remote URLs (async fetch)
  - HTML pastes with data URLs (decode and save)

### Copy Handling
- `src/editor/editor.ts:828-904` - setupCopyHandler (image clipboard support)

## Summary: Mental Model

Think of this as a three-layer system:

1. **Session layer** (appState): Which notebook/note is open. Pure state machine.

2. **IO scheduling layer** (autosave): Debounces saves. Pure state machine.

3. **Document layer** (ProseMirror): The editor content. Immutable state + transactions.

All three follow the same pattern: **state is never mutated directly, only replaced via explicit operations** (transitions, schedule/cancel, dispatch).

The browser event loop is the outer driver: it delivers events, handlers create transactions or state transitions, and updates flow down to the DOM or disk.

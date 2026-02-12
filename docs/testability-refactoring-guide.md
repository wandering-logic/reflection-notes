# Testability Refactoring Guide

Suggestions for making the codebase more testable, ordered by priority. Each section is self-contained and can be implemented independently.

---

## 1. Dependency Injection for Editor Contexts

**Problem:** The editor uses `WeakMap` to associate context objects with `EditorView` instances. Consumers must call `setImagePasteContext()` before paste works, but nothing enforces this. Tests can't easily inject mock contexts.

**Current code (editor.ts):**
```typescript
const imagePasteContexts = new WeakMap<EditorView, ImagePasteContext>();

export function setImagePasteContext(view: EditorView, ctx: ImagePasteContext) {
  imagePasteContexts.set(view, ctx);
}

// In handlePaste:
const ctx = imagePasteContexts.get(view);
if (!ctx) { console.warn("No image paste context"); return; }
```

**Proposed solution:** Pass context as a required parameter when creating the editor.

```typescript
export interface EditorConfig {
  container: HTMLElement;
  initialDoc?: unknown;
  imagePaste: ImagePasteContext;
  assetLoad: AssetLoadContext;
  onChange?: () => void;
  onSelectionChange?: () => void;
}

export function createEditor(config: EditorConfig): EditorView {
  // Context is guaranteed to exist - no WeakMap lookup needed
  const { imagePaste, assetLoad, onChange, onSelectionChange } = config;

  // ... create EditorView with these contexts available to plugins/handlers
}
```

**Benefits:**
- Type system enforces that contexts are provided
- Tests can pass mock contexts directly
- No silent failures when context is missing

**Migration path:**
1. Add `EditorConfig` interface
2. Update `createEditor` to accept config object
3. Update `main.ts` to pass contexts at creation time
4. Remove `setImagePasteContext` and `setAssetLoadContext`
5. Remove WeakMaps

---

## 2. AutosaveManager Class

**Problem:** Autosave uses module-level state with a raw `setTimeout`. If the user switches notes rapidly, the timeout might fire with a stale `currentNote` reference. Testing requires mocking global timers.

**Current code (main.ts):**
```typescript
let autosaveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave() {
  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(() => saveCurrentNote(), 3000);
}
```

**Proposed solution:** Extract to a class with injectable timer functions.

```typescript
// src/autosave.ts
export interface AutosaveConfig {
  delayMs: number;
  save: () => Promise<void>;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export class AutosaveManager {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly delay: number;
  private readonly save: () => Promise<void>;
  private readonly setTimeout: typeof globalThis.setTimeout;
  private readonly clearTimeout: typeof globalThis.clearTimeout;

  constructor(config: AutosaveConfig) {
    this.delay = config.delayMs;
    this.save = config.save;
    this.setTimeout = config.setTimeout ?? globalThis.setTimeout;
    this.clearTimeout = config.clearTimeout ?? globalThis.clearTimeout;
  }

  schedule(): void {
    this.cancel();
    this.timeoutId = this.setTimeout(() => {
      this.timeoutId = null;
      this.save();
    }, this.delay);
  }

  cancel(): void {
    if (this.timeoutId !== null) {
      this.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  async flush(): Promise<void> {
    if (this.timeoutId !== null) {
      this.cancel();
      await this.save();
    }
  }

  get isPending(): boolean {
    return this.timeoutId !== null;
  }
}
```

**Test example:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { AutosaveManager } from './autosave';

describe('AutosaveManager', () => {
  it('calls save after delay', () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const manager = new AutosaveManager({ delayMs: 3000, save });

    manager.schedule();
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(save).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('cancels pending save on reschedule', () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const manager = new AutosaveManager({ delayMs: 3000, save });

    manager.schedule();
    vi.advanceTimersByTime(2000);
    manager.schedule(); // reschedule before firing
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled(); // still waiting

    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('flush saves immediately and cancels timer', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const manager = new AutosaveManager({ delayMs: 3000, save });

    manager.schedule();
    await manager.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(manager.isPending).toBe(false);

    vi.useRealTimers();
  });
});
```

**Usage in main.ts:**
```typescript
let autosaveManager: AutosaveManager | null = null;

// When note is loaded:
autosaveManager = new AutosaveManager({
  delayMs: 3000,
  save: () => saveCurrentNote(),
});

// When editor changes:
autosaveManager?.schedule();

// When switching notes:
await autosaveManager?.flush();
autosaveManager = new AutosaveManager({ ... }); // new manager for new note
```

---

## 3. Error Handler Abstraction

**Problem:** Three inconsistent error handling patterns exist:
- Silent swallow: `catch {}`
- Blocking UI: `alert(e.message)`
- Console only: `console.error()`

**Proposed solution:** Create a unified error reporting interface.

```typescript
// src/errors.ts
export type ErrorLevel = 'info' | 'warning' | 'error';

export interface ErrorReporter {
  /** Show a non-blocking notification to the user */
  notify(message: string, level: ErrorLevel): void;

  /** Log an error for debugging (may not be visible to user) */
  log(error: Error, context?: Record<string, unknown>): void;
}

/** Production implementation - shows toast notifications */
export function createErrorReporter(toastContainer: HTMLElement): ErrorReporter {
  return {
    notify(message, level) {
      const toast = document.createElement('div');
      toast.className = `toast toast-${level}`;
      toast.textContent = message;
      toastContainer.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
    },
    log(error, context) {
      console.error(error, context);
      // Could also send to error tracking service
    },
  };
}

/** Test implementation - records all calls */
export function createMockErrorReporter(): ErrorReporter & {
  notifications: Array<{ message: string; level: ErrorLevel }>;
  errors: Array<{ error: Error; context?: Record<string, unknown> }>;
} {
  const notifications: Array<{ message: string; level: ErrorLevel }> = [];
  const errors: Array<{ error: Error; context?: Record<string, unknown> }> = [];

  return {
    notifications,
    errors,
    notify(message, level) {
      notifications.push({ message, level });
    },
    log(error, context) {
      errors.push({ error, context });
    },
  };
}
```

**Usage:**
```typescript
// Instead of:
try {
  await saveNote(fs, notebook, note);
} catch (e) {
  alert(e.message);
}

// Use:
try {
  await saveNote(fs, notebook, note);
} catch (e) {
  errorReporter.notify('Failed to save note', 'error');
  errorReporter.log(e as Error, { notePath: note.path });
}
```

---

## 4. Pure Event Handlers

**Problem:** Event handlers in `main.ts` directly mutate module-level state and perform side effects, making them untestable.

**Current pattern:**
```typescript
newNoteBtn.addEventListener("click", async () => {
  if (!currentNotebook) return;
  await saveCurrentNote();
  const note = await createNote(fs, currentNotebook);
  currentNote = note;
  // ... more side effects
});
```

**Proposed pattern:** Separate decision logic from execution.

```typescript
// src/handlers.ts - Pure functions, easily testable
export type NoteAction =
  | { type: 'create_note' }
  | { type: 'switch_note'; path: string }
  | { type: 'save_current' }
  | { type: 'error'; message: string }
  | { type: 'noop' };

export function handleNewNoteIntent(state: {
  notebook: Notebook | null;
  hasUnsavedChanges: boolean;
}): NoteAction[] {
  if (!state.notebook) {
    return [{ type: 'error', message: 'No notebook open' }];
  }

  const actions: NoteAction[] = [];
  if (state.hasUnsavedChanges) {
    actions.push({ type: 'save_current' });
  }
  actions.push({ type: 'create_note' });
  return actions;
}
```

```typescript
// src/main.ts - Thin wiring layer
async function dispatch(actions: NoteAction[]) {
  for (const action of actions) {
    switch (action.type) {
      case 'create_note':
        const note = await createNote(fs, currentNotebook!);
        currentNote = note;
        loadNoteIntoEditor(note);
        break;
      case 'save_current':
        await saveCurrentNote();
        break;
      case 'error':
        errorReporter.notify(action.message, 'error');
        break;
      // ...
    }
  }
}

newNoteBtn.addEventListener("click", () => {
  const actions = handleNewNoteIntent({
    notebook: currentNotebook,
    hasUnsavedChanges: editor?.state.doc !== lastSavedDoc,
  });
  dispatch(actions);
});
```

**Test example:**
```typescript
describe('handleNewNoteIntent', () => {
  it('returns error when no notebook is open', () => {
    const actions = handleNewNoteIntent({ notebook: null, hasUnsavedChanges: false });
    expect(actions).toEqual([{ type: 'error', message: 'No notebook open' }]);
  });

  it('saves before creating when there are unsaved changes', () => {
    const actions = handleNewNoteIntent({
      notebook: mockNotebook,
      hasUnsavedChanges: true
    });
    expect(actions).toEqual([
      { type: 'save_current' },
      { type: 'create_note' },
    ]);
  });
});
```

---

## 5. Consolidate Image Utilities

**Problem:** `isRelativePath` is duplicated in `editor.ts` and `imageNodeView.ts`. Image-related utilities are scattered.

**Proposed solution:** Create `src/editor/imageUtils.ts`:

```typescript
// src/editor/imageUtils.ts

export type ImageSrcType = 'remote' | 'data' | 'relative' | 'blob';

export function categorizeImageSrc(src: string): ImageSrcType {
  if (src.startsWith('data:')) return 'data';
  if (src.startsWith('http://') || src.startsWith('https://')) return 'remote';
  if (src.startsWith('blob:')) return 'blob';
  return 'relative';
}

export function isRelativePath(src: string): boolean {
  const type = categorizeImageSrc(src);
  return type === 'relative';
}

// Re-export from storage/image.ts for convenience
export {
  getMimeTypeFromExtension,
  isAllowedImageType
} from '../storage/image';
```

**Migration:**
1. Create the new file with the consolidated functions
2. Update `editor.ts` to import from `imageUtils.ts`
3. Update `imageNodeView.ts` to import from `imageUtils.ts`
4. Delete the duplicate definitions
5. Update tests to import from the new location

---

## 6. ClipboardProvider Interface

**Problem:** Copy handler directly uses `navigator.clipboard`, making it untestable without mocking browser globals.

**Proposed solution:** Create an interface similar to `FileSystemProvider`.

```typescript
// src/clipboard.ts
export interface ClipboardProvider {
  write(items: ClipboardItem[]): Promise<void>;
  read(): Promise<ClipboardItems>;
}

export function createBrowserClipboard(): ClipboardProvider {
  return {
    async write(items) {
      await navigator.clipboard.write(items);
    },
    async read() {
      return navigator.clipboard.read();
    },
  };
}

export function createMockClipboard(): ClipboardProvider & {
  lastWritten: ClipboardItem[] | null;
} {
  let lastWritten: ClipboardItem[] | null = null;
  return {
    get lastWritten() { return lastWritten; },
    async write(items) {
      lastWritten = items;
    },
    async read() {
      // Return mock data or throw
      throw new Error('Mock clipboard is empty');
    },
  };
}
```

---

## Implementation Order

1. **AutosaveManager** (highest risk area, self-contained)
2. **Consolidate imageUtils.ts** (quick win, removes duplication)
3. **ErrorReporter** (improves UX and testability)
4. **Dependency injection for contexts** (enables testing paste handler)
5. **Pure event handlers** (can be done incrementally per handler)
6. **ClipboardProvider** (lower priority, copy is less critical than paste)

Each refactoring should be done in a separate commit/PR with tests added alongside the new code.

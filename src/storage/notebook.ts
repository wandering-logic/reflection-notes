import {
  HANDLE_STORAGE_KEY,
  NOTEBOOK_FILE,
  NOTEBOOK_VERSION,
} from "./constants";
import type { FileSystemProvider } from "./filesystem";
import { createNote, type Note } from "./note";

export interface NotebookMeta {
  version: number;
  lastOpenedNote: string | null;
}

export interface Notebook {
  /** Directory handle for the notebook root */
  handle: FileSystemDirectoryHandle;
  /** Parsed notebook.json */
  meta: NotebookMeta;
  /** Directory name (user-facing notebook name) */
  name: string;
}

/**
 * Create default notebook metadata.
 */
function createDefaultMeta(): NotebookMeta {
  return {
    version: NOTEBOOK_VERSION,
    lastOpenedNote: null,
  };
}

/**
 * Read notebook.json from a directory.
 * Returns null if file doesn't exist or is invalid.
 */
async function readNotebookMeta(
  fs: FileSystemProvider,
  handle: FileSystemDirectoryHandle,
): Promise<NotebookMeta | null> {
  try {
    const text = await fs.readTextFile(handle, NOTEBOOK_FILE);
    return JSON.parse(text) as NotebookMeta;
  } catch {
    return null;
  }
}

/**
 * Open existing notebook - user picks directory.
 * Throws if notebook.json doesn't exist.
 */
export async function openNotebook(fs: FileSystemProvider): Promise<Notebook> {
  const handle = await fs.pickDirectory();
  const meta = await readNotebookMeta(fs, handle);

  if (!meta) {
    throw new Error("Not a valid notebook directory (missing notebook.json)");
  }

  // Persist handle for future sessions
  await fs.persistHandle(HANDLE_STORAGE_KEY, handle);

  return {
    handle,
    meta,
    name: handle.name,
  };
}

/**
 * Create new notebook - user picks/creates directory.
 * Writes initial notebook.json.
 * Creates and returns the first (blank) note.
 */
export async function createNotebook(
  fs: FileSystemProvider,
): Promise<{ notebook: Notebook; note: Note }> {
  const handle = await fs.pickDirectory();

  // Check if this is already a notebook
  const existingMeta = await readNotebookMeta(fs, handle);
  if (existingMeta) {
    throw new Error(
      "Directory is already a notebook. Use Open Notebook instead.",
    );
  }

  // Create metadata
  const meta = createDefaultMeta();

  // Create initial note
  const notebook: Notebook = {
    handle,
    meta,
    name: handle.name,
  };

  const note = await createNote(fs, notebook);

  // Update meta with the note path and save
  meta.lastOpenedNote = note.path;
  await fs.writeTextFile(handle, NOTEBOOK_FILE, JSON.stringify(meta, null, 2));

  // Persist handle for future sessions
  await fs.persistHandle(HANDLE_STORAGE_KEY, handle);

  return { notebook, note };
}

export interface RestoreResult {
  notebook: Notebook;
  needsPermission: boolean;
}

/**
 * Try to restore last-used notebook from persisted handle.
 * Returns null if no persisted handle.
 * Returns { notebook, needsPermission: true } if permission is needed.
 */
export async function restoreNotebook(
  fs: FileSystemProvider,
): Promise<RestoreResult | null> {
  const result = await fs.getPersistedHandle(HANDLE_STORAGE_KEY);
  if (!result) return null;

  const { handle, needsPermission } = result;

  // If we need permission, we can't read the meta yet - return partial info
  if (needsPermission) {
    return {
      notebook: {
        handle,
        meta: { version: NOTEBOOK_VERSION, lastOpenedNote: null },
        name: handle.name,
      },
      needsPermission: true,
    };
  }

  const meta = await readNotebookMeta(fs, handle);
  if (!meta) return null;

  return {
    notebook: {
      handle,
      meta,
      name: handle.name,
    },
    needsPermission: false,
  };
}

/**
 * Request permission for a notebook handle and load its metadata.
 * Call this after user grants permission via a gesture.
 */
export async function reconnectNotebook(
  fs: FileSystemProvider,
  handle: FileSystemDirectoryHandle,
): Promise<Notebook | null> {
  const granted = await fs.requestPermission(handle);
  if (!granted) return null;

  const meta = await readNotebookMeta(fs, handle);
  if (!meta) return null;

  return {
    handle,
    meta,
    name: handle.name,
  };
}

/**
 * Save notebook metadata (e.g., after changing lastOpenedNote).
 */
export async function saveNotebookMeta(
  fs: FileSystemProvider,
  notebook: Notebook,
): Promise<void> {
  await fs.writeTextFile(
    notebook.handle,
    NOTEBOOK_FILE,
    JSON.stringify(notebook.meta, null, 2),
  );
}

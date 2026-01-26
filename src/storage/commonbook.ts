import {
  COMMONBOOK_FILE,
  COMMONBOOK_VERSION,
  HANDLE_STORAGE_KEY,
} from "./constants";
import { createEntry, type Entry } from "./entry";
import type { FileSystemProvider } from "./filesystem";

export interface CommonbookMeta {
  version: number;
  lastOpenedEntry: string | null;
}

export interface Commonbook {
  /** Directory handle for the commonbook root */
  handle: FileSystemDirectoryHandle;
  /** Parsed commonbook.json */
  meta: CommonbookMeta;
  /** Directory name (user-facing commonbook name) */
  name: string;
}

/**
 * Create default commonbook metadata.
 */
function createDefaultMeta(): CommonbookMeta {
  return {
    version: COMMONBOOK_VERSION,
    lastOpenedEntry: null,
  };
}

/**
 * Read commonbook.json from a directory.
 * Returns null if file doesn't exist or is invalid.
 */
async function readCommonbookMeta(
  fs: FileSystemProvider,
  handle: FileSystemDirectoryHandle,
): Promise<CommonbookMeta | null> {
  try {
    const text = await fs.readTextFile(handle, COMMONBOOK_FILE);
    return JSON.parse(text) as CommonbookMeta;
  } catch {
    return null;
  }
}

/**
 * Open existing commonbook - user picks directory.
 * Throws if commonbook.json doesn't exist.
 */
export async function openCommonbook(
  fs: FileSystemProvider,
): Promise<Commonbook> {
  const handle = await fs.pickDirectory();
  const meta = await readCommonbookMeta(fs, handle);

  if (!meta) {
    throw new Error(
      "Not a valid commonbook directory (missing commonbook.json)",
    );
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
 * Create new commonbook - user picks/creates directory.
 * Writes initial commonbook.json.
 * Creates and returns the first (blank) entry.
 */
export async function createCommonbook(
  fs: FileSystemProvider,
): Promise<{ commonbook: Commonbook; entry: Entry }> {
  const handle = await fs.pickDirectory();

  // Check if this is already a commonbook
  const existingMeta = await readCommonbookMeta(fs, handle);
  if (existingMeta) {
    throw new Error(
      "Directory is already a commonbook. Use Open Commonbook instead.",
    );
  }

  // Create metadata
  const meta = createDefaultMeta();

  // Create initial entry
  const commonbook: Commonbook = {
    handle,
    meta,
    name: handle.name,
  };

  const entry = await createEntry(fs, commonbook);

  // Update meta with the entry path and save
  meta.lastOpenedEntry = entry.path;
  await fs.writeTextFile(
    handle,
    COMMONBOOK_FILE,
    JSON.stringify(meta, null, 2),
  );

  // Persist handle for future sessions
  await fs.persistHandle(HANDLE_STORAGE_KEY, handle);

  return { commonbook, entry };
}

/**
 * Try to restore last-used commonbook from persisted handle.
 * Returns null if no persisted handle or permission denied.
 */
export async function restoreCommonbook(
  fs: FileSystemProvider,
): Promise<Commonbook | null> {
  const handle = await fs.getPersistedHandle(HANDLE_STORAGE_KEY);
  if (!handle) return null;

  const meta = await readCommonbookMeta(fs, handle);
  if (!meta) return null;

  return {
    handle,
    meta,
    name: handle.name,
  };
}

/**
 * Save commonbook metadata (e.g., after changing lastOpenedEntry).
 */
export async function saveCommonbookMeta(
  fs: FileSystemProvider,
  commonbook: Commonbook,
): Promise<void> {
  await fs.writeTextFile(
    commonbook.handle,
    COMMONBOOK_FILE,
    JSON.stringify(commonbook.meta, null, 2),
  );
}

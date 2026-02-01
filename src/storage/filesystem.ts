/**
 * Abstract file system interface.
 * Implemented for local File System Access API now,
 * can be implemented for cloud providers later.
 */
export interface FileSystemProvider {
  /** User picks a directory via system dialog */
  pickDirectory(): Promise<FileSystemDirectoryHandle>;

  /** Read a text file at path relative to dir */
  readTextFile(dir: FileSystemDirectoryHandle, path: string): Promise<string>;

  /** Write a text file at path relative to dir (creates parent dirs as needed) */
  writeTextFile(
    dir: FileSystemDirectoryHandle,
    path: string,
    content: string,
  ): Promise<void>;

  /** Create directory at path relative to dir (creates parents as needed) */
  mkdir(
    dir: FileSystemDirectoryHandle,
    path: string,
  ): Promise<FileSystemDirectoryHandle>;

  /** List immediate children of a directory */
  listDir(
    dir: FileSystemDirectoryHandle,
  ): Promise<Array<{ name: string; isDirectory: boolean }>>;

  /** Check if a file or directory exists at path */
  exists(dir: FileSystemDirectoryHandle, path: string): Promise<boolean>;

  /** Store handle in IndexedDB for persistence across sessions */
  persistHandle(key: string, handle: FileSystemDirectoryHandle): Promise<void>;

  /** Retrieve persisted handle without requesting permission */
  getPersistedHandle(key: string): Promise<{
    handle: FileSystemDirectoryHandle;
    needsPermission: boolean;
  } | null>;

  /** Request permission on a handle (requires user gesture) */
  requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean>;
}

/**
 * File System Access API implementation of FileSystemProvider.
 * Uses the local file system via browser's showDirectoryPicker API.
 */
export class LocalFileSystemProvider implements FileSystemProvider {
  private dbName = "notebook-storage";
  private storeName = "handles";

  async pickDirectory(): Promise<FileSystemDirectoryHandle> {
    // @ts-expect-error - showDirectoryPicker is not in all TS libs yet
    return await window.showDirectoryPicker({ mode: "readwrite" });
  }

  async readTextFile(
    dir: FileSystemDirectoryHandle,
    path: string,
  ): Promise<string> {
    const handle = await this.getFileHandle(dir, path);
    const file = await handle.getFile();
    return await file.text();
  }

  async writeTextFile(
    dir: FileSystemDirectoryHandle,
    path: string,
    content: string,
  ): Promise<void> {
    // Ensure parent directories exist
    const parts = path.split("/");
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error("Invalid path: empty filename");
    }
    let current = dir;

    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }

    const fileHandle = await current.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async mkdir(
    dir: FileSystemDirectoryHandle,
    path: string,
  ): Promise<FileSystemDirectoryHandle> {
    const parts = path.split("/").filter((p) => p.length > 0);
    let current = dir;

    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }

    return current;
  }

  async listDir(
    dir: FileSystemDirectoryHandle,
  ): Promise<Array<{ name: string; isDirectory: boolean }>> {
    const entries: Array<{ name: string; isDirectory: boolean }> = [];

    // TypeScript types for async iteration are incomplete
    const iterable = dir as unknown as AsyncIterable<
      [string, FileSystemHandle]
    >;
    for await (const [name, handle] of iterable) {
      entries.push({
        name,
        isDirectory: handle.kind === "directory",
      });
    }

    return entries;
  }

  async exists(dir: FileSystemDirectoryHandle, path: string): Promise<boolean> {
    try {
      await this.getFileHandle(dir, path);
      return true;
    } catch {
      try {
        await this.getDirHandle(dir, path);
        return true;
      } catch {
        return false;
      }
    }
  }

  async persistHandle(
    key: string,
    handle: FileSystemDirectoryHandle,
  ): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const request = store.put(handle, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPersistedHandle(key: string): Promise<{
    handle: FileSystemDirectoryHandle;
    needsPermission: boolean;
  } | null> {
    const db = await this.openDB();
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );

    if (!handle) return null;

    // Check if we already have permission
    // @ts-expect-error - queryPermission is not in TS lib yet
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
      return { handle, needsPermission: false };
    }

    // We have the handle but need permission (requires user gesture)
    return { handle, needsPermission: true };
  }

  async requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
      // @ts-expect-error - requestPermission is not in TS lib yet
      const result = await handle.requestPermission({ mode: "readwrite" });
      return result === "granted";
    } catch {
      return false;
    }
  }

  // Helper: navigate to a file handle at a path
  private async getFileHandle(
    dir: FileSystemDirectoryHandle,
    path: string,
  ): Promise<FileSystemFileHandle> {
    const parts = path.split("/");
    const fileName = parts.pop();
    if (!fileName) {
      throw new Error("Invalid path: empty filename");
    }
    let current = dir;

    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    return await current.getFileHandle(fileName);
  }

  // Helper: navigate to a directory handle at a path
  private async getDirHandle(
    dir: FileSystemDirectoryHandle,
    path: string,
  ): Promise<FileSystemDirectoryHandle> {
    const parts = path.split("/").filter((p) => p.length > 0);
    let current = dir;

    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    return current;
  }

  // Helper: open IndexedDB
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }
}

import { schema } from "../editor/schema";
import { NOTE_FILE } from "./constants";
import type { FileSystemProvider } from "./filesystem";
import type { Notebook } from "./notebook";

export interface Note {
  /** Path relative to notebook root, e.g., "2026/01/26/1" */
  path: string;
  /** ProseMirror document JSON */
  content: unknown;
}

export interface NoteInfo {
  /** Path relative to notebook root */
  path: string;
  /** Extracted from doc, or "Untitled" */
  title: string;
  /** Timestamp from doc's created node */
  created: number;
}

/**
 * Create a blank ProseMirror document with the given timestamp.
 */
export function createBlankDocument(timestamp: number): unknown {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.title.create(),
    schema.nodes.created.create({ timestamp }),
    schema.nodes.paragraph.create(),
  ]);
  return doc.toJSON();
}

/**
 * Extract title text from ProseMirror document JSON.
 * Returns "Untitled" if title node is empty.
 */
export function extractTitle(content: unknown): string {
  const doc = content as {
    content?: Array<{ type: string; content?: Array<{ text?: string }> }>;
  };

  if (!doc.content || doc.content.length === 0) {
    return "Untitled";
  }

  const titleNode = doc.content[0];
  if (titleNode.type !== "title" || !titleNode.content) {
    return "Untitled";
  }

  const text = titleNode.content
    .map((n) => n.text || "")
    .join("")
    .trim();

  return text || "Untitled";
}

/**
 * Extract created timestamp from ProseMirror document JSON.
 */
export function extractCreated(content: unknown): number {
  const doc = content as {
    content?: Array<{ type: string; attrs?: { timestamp?: number } }>;
  };

  if (!doc.content) {
    return 0;
  }

  const createdNode = doc.content.find((n) => n.type === "created");
  return createdNode?.attrs?.timestamp || 0;
}

/**
 * Generate a new note path as yyyy/mm/dd/n.
 */
async function generateNotePath(
  fs: FileSystemProvider,
  notebook: Notebook,
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");

  const datePath = `${year}/${month}/${day}`;

  // Create date directories if they don't exist
  await fs.mkdir(notebook.handle, datePath);

  // Find next available number
  let n = 1;
  while (await fs.exists(notebook.handle, `${datePath}/${n}`)) {
    n++;
  }

  return `${datePath}/${n}`;
}

/**
 * Create a new note with blank content.
 * Generates path as yyyy/mm/dd/n where n is next available number.
 */
export async function createNote(
  fs: FileSystemProvider,
  notebook: Notebook,
): Promise<Note> {
  const path = await generateNotePath(fs, notebook);
  const content = createBlankDocument(Date.now());

  // Create the note directory and write the file
  await fs.mkdir(notebook.handle, path);
  await fs.writeTextFile(
    notebook.handle,
    `${path}/${NOTE_FILE}`,
    JSON.stringify(content, null, 2),
  );

  return { path, content };
}

/**
 * Load note content from disk.
 */
export async function loadNote(
  fs: FileSystemProvider,
  notebook: Notebook,
  path: string,
): Promise<Note> {
  const text = await fs.readTextFile(notebook.handle, `${path}/${NOTE_FILE}`);
  const content = JSON.parse(text);
  return { path, content };
}

/**
 * Save note content to disk.
 */
export async function saveNote(
  fs: FileSystemProvider,
  notebook: Notebook,
  note: Note,
): Promise<void> {
  await fs.writeTextFile(
    notebook.handle,
    `${note.path}/${NOTE_FILE}`,
    JSON.stringify(note.content, null, 2),
  );
}

/**
 * List all notes in the notebook.
 * Scans directory tree, reads each note.json to extract title.
 * Returns sorted by created date (newest first).
 */
export async function listNotes(
  fs: FileSystemProvider,
  notebook: Notebook,
): Promise<NoteInfo[]> {
  const notes: NoteInfo[] = [];

  // Scan year directories
  const years = await fs.listDir(notebook.handle);
  for (const year of years) {
    if (!year.isDirectory || !/^\d{4}$/.test(year.name)) continue;

    const yearHandle = await fs
      .mkdir(notebook.handle, year.name)
      .catch(() => null);
    if (!yearHandle) continue;

    // Scan month directories
    const months = await fs.listDir(yearHandle);
    for (const month of months) {
      if (!month.isDirectory || !/^\d{2}$/.test(month.name)) continue;

      const monthHandle = await fs
        .mkdir(yearHandle, month.name)
        .catch(() => null);
      if (!monthHandle) continue;

      // Scan day directories
      const days = await fs.listDir(monthHandle);
      for (const day of days) {
        if (!day.isDirectory || !/^\d{2}$/.test(day.name)) continue;

        const dayHandle = await fs
          .mkdir(monthHandle, day.name)
          .catch(() => null);
        if (!dayHandle) continue;

        // Scan note directories
        const noteDirs = await fs.listDir(dayHandle);
        for (const noteDir of noteDirs) {
          if (!noteDir.isDirectory) continue;

          const notePath = `${year.name}/${month.name}/${day.name}/${noteDir.name}`;

          try {
            const text = await fs.readTextFile(
              notebook.handle,
              `${notePath}/${NOTE_FILE}`,
            );
            const content = JSON.parse(text);
            notes.push({
              path: notePath,
              title: extractTitle(content),
              created: extractCreated(content),
            });
          } catch {
            // Skip directories without valid note.json
          }
        }
      }
    }
  }

  // Sort by created date, newest first
  return notes.sort((a, b) => b.created - a.created);
}

import { schema } from "../editor/schema";
import type { Commonbook } from "./commonbook";
import { ENTRY_FILE } from "./constants";
import type { FileSystemProvider } from "./filesystem";

export interface Entry {
  /** Path relative to commonbook root, e.g., "2026/01/26/1" */
  path: string;
  /** ProseMirror document JSON */
  content: unknown;
}

export interface EntryInfo {
  /** Path relative to commonbook root */
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
    schema.nodes.subtitle.create(),
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
 * Generate a new entry path as yyyy/mm/dd/n.
 */
async function generateEntryPath(
  fs: FileSystemProvider,
  commonbook: Commonbook,
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");

  const datePath = `${year}/${month}/${day}`;

  // Create date directories if they don't exist
  await fs.mkdir(commonbook.handle, datePath);

  // Find next available number
  let n = 1;
  while (await fs.exists(commonbook.handle, `${datePath}/${n}`)) {
    n++;
  }

  return `${datePath}/${n}`;
}

/**
 * Create a new entry with blank content.
 * Generates path as yyyy/mm/dd/n where n is next available number.
 */
export async function createEntry(
  fs: FileSystemProvider,
  commonbook: Commonbook,
): Promise<Entry> {
  const path = await generateEntryPath(fs, commonbook);
  const content = createBlankDocument(Date.now());

  // Create the entry directory and write the file
  await fs.mkdir(commonbook.handle, path);
  await fs.writeTextFile(
    commonbook.handle,
    `${path}/${ENTRY_FILE}`,
    JSON.stringify(content, null, 2),
  );

  return { path, content };
}

/**
 * Load entry content from disk.
 */
export async function loadEntry(
  fs: FileSystemProvider,
  commonbook: Commonbook,
  path: string,
): Promise<Entry> {
  const text = await fs.readTextFile(
    commonbook.handle,
    `${path}/${ENTRY_FILE}`,
  );
  const content = JSON.parse(text);
  return { path, content };
}

/**
 * Save entry content to disk.
 */
export async function saveEntry(
  fs: FileSystemProvider,
  commonbook: Commonbook,
  entry: Entry,
): Promise<void> {
  await fs.writeTextFile(
    commonbook.handle,
    `${entry.path}/${ENTRY_FILE}`,
    JSON.stringify(entry.content, null, 2),
  );
}

/**
 * List all entries in the commonbook.
 * Scans directory tree, reads each entry.json to extract title.
 * Returns sorted by created date (newest first).
 */
export async function listEntries(
  fs: FileSystemProvider,
  commonbook: Commonbook,
): Promise<EntryInfo[]> {
  const entries: EntryInfo[] = [];

  // Scan year directories
  const years = await fs.listDir(commonbook.handle);
  for (const year of years) {
    if (!year.isDirectory || !/^\d{4}$/.test(year.name)) continue;

    const yearHandle = await fs
      .mkdir(commonbook.handle, year.name)
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

        // Scan entry directories
        const entryDirs = await fs.listDir(dayHandle);
        for (const entryDir of entryDirs) {
          if (!entryDir.isDirectory) continue;

          const entryPath = `${year.name}/${month.name}/${day.name}/${entryDir.name}`;

          try {
            const text = await fs.readTextFile(
              commonbook.handle,
              `${entryPath}/${ENTRY_FILE}`,
            );
            const content = JSON.parse(text);
            entries.push({
              path: entryPath,
              title: extractTitle(content),
              created: extractCreated(content),
            });
          } catch {
            // Skip directories without valid entry.json
          }
        }
      }
    }
  }

  // Sort by created date, newest first
  return entries.sort((a, b) => b.created - a.created);
}

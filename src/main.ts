import "./style.css";
import "prosemirror-view/style/prosemirror.css";
import * as Editor from "./editor/editor";
import {
  type Commonbook,
  createCommonbook,
  openCommonbook,
  restoreCommonbook,
  saveCommonbookMeta,
} from "./storage/commonbook";
import {
  createEntry,
  type Entry,
  extractTitle,
  listEntries,
  loadEntry,
  saveEntry,
} from "./storage/entry";
import { LocalFileSystemProvider } from "./storage/filesystem";

// File system provider
const fs = new LocalFileSystemProvider();

// Current state
let currentCommonbook: Commonbook | null = null;
let currentEntry: Entry | null = null;

function updateTitle() {
  if (!currentCommonbook) {
    document.title = "Notebook";
    return;
  }
  const entryTitle = currentEntry
    ? extractTitle(currentEntry.content)
    : "Untitled";
  document.title = `${entryTitle} - ${currentCommonbook.name}`;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app not found");

app.innerHTML = `
  <div class="layout">
    <header class="menubar">
      <div class="menu">
        File
        <div class="menu-dropdown">
          <div class="menu-item" id="file-new-entry">New Entry</div>
          <div class="menu-item" id="file-open-entry">Open Entry...</div>
          <div class="menu-separator"></div>
          <div class="menu-item" id="file-new-commonbook">New Commonbook...</div>
          <div class="menu-item" id="file-open-commonbook">Open Commonbook...</div>
        </div>
      </div>
      <div class="menu">
        Edit
        <div class="menu-dropdown">
          <div class="menu-item" id="edit-undo">Undo</div>
          <div class="menu-item" id="edit-redo">Redo</div>
        </div>
      </div>
      <div class="menu">
        Format
        <div class="menu-dropdown">
          <div class="menu-item has-submenu">
            Text
            <div class="submenu">
              <div class="menu-item" id="format-strong">Strong</div>
              <div class="menu-item" id="format-em">Emphasis</div>
              <div class="menu-item" id="format-code">Code</div>
              <div class="menu-item" id="format-link">Link...</div>
            </div>
          </div>
          <div class="menu-item has-submenu">
            Block
            <div class="submenu">
              <div class="menu-item" id="format-paragraph">Paragraph</div>
              <div class="menu-item" id="format-section">Section</div>
              <div class="menu-item" id="format-subsection">Subsection</div>
              <div class="menu-item" id="format-subsubsection">Subsubsection</div>
              <div class="menu-item" id="format-subsubsubsection">Subsubsubsection</div>
              <div class="menu-separator"></div>
              <div class="menu-item" id="format-blockquote">Block Quote</div>
              <div class="menu-item" id="format-code-block">Code Block</div>
              <div class="menu-item" id="format-hr">Horizontal Rule</div>
            </div>
          </div>
        </div>
      </div>
      <div class="menu">View</div>
      <div class="menu">Preferences</div>
      <div class="menu">Help</div>
    </header>

    <div class="body">
      <aside class="sidebar hidden" id="sidebar">
        <div class="sidebar-title">Notebook</div>
      </aside>

      <main class="editor-host">
        <div class="format-indicator" id="format-indicator"></div>
        <div id="editor"></div>
      </main>
    </div>
  </div>

  <div class="welcome-dialog hidden" id="welcome-dialog">
    <div class="welcome-content">
      <h1>Welcome to Notebook</h1>
      <p>Create a new commonbook or open an existing one to get started.</p>
      <div class="welcome-buttons">
        <button id="welcome-new">New Commonbook</button>
        <button id="welcome-open">Open Commonbook</button>
      </div>
    </div>
  </div>
`;

const editor = document.querySelector<HTMLDivElement>("#editor");
if (!editor) throw new Error("#editor not found");

const view = Editor.mountEditor(editor);

// Click in empty space below content should focus and move cursor to end
editor.addEventListener("click", (e) => {
  if (e.target === editor) {
    Editor.focusAtEnd(view);
  }
});

document.querySelector("#edit-undo")?.addEventListener("click", () => {
  Editor.doUndo(view);
  view.focus();
});

document.querySelector("#edit-redo")?.addEventListener("click", () => {
  Editor.doRedo(view);
  view.focus();
});

// Format menu - block types
document.querySelector("#format-paragraph")?.addEventListener("click", () => {
  Editor.setParagraph(view);
  view.focus();
});

document.querySelector("#format-section")?.addEventListener("click", () => {
  Editor.setSection(view, 1);
  view.focus();
});

document.querySelector("#format-subsection")?.addEventListener("click", () => {
  Editor.setSection(view, 2);
  view.focus();
});

document
  .querySelector("#format-subsubsection")
  ?.addEventListener("click", () => {
    Editor.setSection(view, 3);
    view.focus();
  });

document
  .querySelector("#format-subsubsubsection")
  ?.addEventListener("click", () => {
    Editor.setSection(view, 4);
    view.focus();
  });

document.querySelector("#format-code-block")?.addEventListener("click", () => {
  Editor.setCodeBlock(view);
  view.focus();
});

document.querySelector("#format-blockquote")?.addEventListener("click", () => {
  Editor.setBlockquote(view);
  view.focus();
});

document.querySelector("#format-hr")?.addEventListener("click", () => {
  Editor.insertHorizontalRule(view);
  view.focus();
});

// Format menu - marks
document.querySelector("#format-strong")?.addEventListener("click", () => {
  Editor.toggleStrong(view);
  view.focus();
});

document.querySelector("#format-em")?.addEventListener("click", () => {
  Editor.toggleEm(view);
  view.focus();
});

document.querySelector("#format-code")?.addEventListener("click", () => {
  Editor.toggleCode(view);
  view.focus();
});

document.querySelector("#format-link")?.addEventListener("click", () => {
  const href = prompt("Enter URL:");
  if (href) {
    Editor.toggleLink(view, href);
  }
  view.focus();
});

// File menu handlers

async function handleNewEntry() {
  if (!currentCommonbook) return;

  // Save current entry first
  await saveCurrentEntry();

  // Create new entry
  const entry = await createEntry(fs, currentCommonbook);
  currentEntry = entry;

  // Update commonbook meta
  currentCommonbook.meta.lastOpenedEntry = entry.path;
  await saveCommonbookMeta(fs, currentCommonbook);

  // Load into editor
  Editor.setContent(view, entry.content);
  updateTitle();
  view.focus();
}

async function handleOpenEntry() {
  if (!currentCommonbook) return;

  const entries = await listEntries(fs, currentCommonbook);
  if (entries.length === 0) {
    alert("No entries in this commonbook.");
    return;
  }

  // Format entry list for display
  const formatDate = (ts: number) => {
    if (!ts) return "Unknown date";
    return new Date(ts).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const choices = entries
    .map((e, i) => {
      const title =
        e.title === "Untitled"
          ? `Untitled - ${formatDate(e.created)}`
          : e.title;
      return `${i + 1}. ${title}`;
    })
    .join("\n");

  const choice = prompt(`Open entry:\n${choices}\n\nEnter number:`);
  if (!choice) return;

  const index = parseInt(choice, 10) - 1;
  if (index < 0 || index >= entries.length) {
    alert("Invalid choice.");
    return;
  }

  // Save current entry first
  await saveCurrentEntry();

  // Load selected entry
  const entryInfo = entries[index];
  const entry = await loadEntry(fs, currentCommonbook, entryInfo.path);
  currentEntry = entry;

  // Update commonbook meta
  currentCommonbook.meta.lastOpenedEntry = entry.path;
  await saveCommonbookMeta(fs, currentCommonbook);

  // Load into editor
  Editor.setContent(view, entry.content);
  updateTitle();
  view.focus();
}

async function handleNewCommonbook() {
  try {
    // Save current entry first
    await saveCurrentEntry();

    const { commonbook, entry } = await createCommonbook(fs);
    currentCommonbook = commonbook;
    currentEntry = entry;

    Editor.setContent(view, entry.content);
    updateTitle();
    hideWelcomeDialog();
    view.focus();
  } catch (e) {
    if (e instanceof Error) {
      alert(e.message);
    }
  }
}

async function handleOpenCommonbook() {
  try {
    // Save current entry first
    await saveCurrentEntry();

    const commonbook = await openCommonbook(fs);
    currentCommonbook = commonbook;

    // Load last opened entry, or create a new one
    if (commonbook.meta.lastOpenedEntry) {
      try {
        const entry = await loadEntry(
          fs,
          commonbook,
          commonbook.meta.lastOpenedEntry,
        );
        currentEntry = entry;
        Editor.setContent(view, entry.content);
      } catch {
        // Last entry doesn't exist, create a new one
        const entry = await createEntry(fs, commonbook);
        currentEntry = entry;
        commonbook.meta.lastOpenedEntry = entry.path;
        await saveCommonbookMeta(fs, commonbook);
        Editor.setContent(view, entry.content);
      }
    } else {
      // No last entry, create a new one
      const entry = await createEntry(fs, commonbook);
      currentEntry = entry;
      commonbook.meta.lastOpenedEntry = entry.path;
      await saveCommonbookMeta(fs, commonbook);
      Editor.setContent(view, entry.content);
    }

    updateTitle();
    hideWelcomeDialog();
    view.focus();
  } catch (e) {
    if (e instanceof Error) {
      alert(e.message);
    }
  }
}

async function saveCurrentEntry() {
  if (!currentCommonbook || !currentEntry) return;

  currentEntry.content = view.state.doc.toJSON();
  await saveEntry(fs, currentCommonbook, currentEntry);
}

document
  .querySelector("#file-new-entry")
  ?.addEventListener("click", handleNewEntry);
document
  .querySelector("#file-open-entry")
  ?.addEventListener("click", handleOpenEntry);
document
  .querySelector("#file-new-commonbook")
  ?.addEventListener("click", handleNewCommonbook);
document
  .querySelector("#file-open-commonbook")
  ?.addEventListener("click", handleOpenCommonbook);

// Welcome dialog handlers
document
  .querySelector("#welcome-new")
  ?.addEventListener("click", handleNewCommonbook);
document
  .querySelector("#welcome-open")
  ?.addEventListener("click", handleOpenCommonbook);

function showWelcomeDialog() {
  document.querySelector("#welcome-dialog")?.classList.remove("hidden");
}

function hideWelcomeDialog() {
  document.querySelector("#welcome-dialog")?.classList.add("hidden");
}

// Autosave: save after changes, debounced
let autosaveTimeout: number | null = null;

function scheduleAutosave() {
  if (!currentCommonbook || !currentEntry) return;

  if (autosaveTimeout) {
    clearTimeout(autosaveTimeout);
  }

  autosaveTimeout = window.setTimeout(async () => {
    await saveCurrentEntry();
    // Update title in case it changed
    updateTitle();
  }, 1000);
}

// Listen for editor changes
Editor.onChange(view, scheduleAutosave);

// Update format indicator when selection changes
const formatIndicator =
  document.querySelector<HTMLDivElement>("#format-indicator");

function updateFormatIndicator() {
  if (formatIndicator) {
    formatIndicator.textContent = Editor.getBlockTypeName(view);
  }
}

Editor.onSelectionChange(view, updateFormatIndicator);
updateFormatIndicator();

// Startup: try to restore previous commonbook
async function startup() {
  const commonbook = await restoreCommonbook(fs);

  if (commonbook) {
    currentCommonbook = commonbook;

    // Load last opened entry
    if (commonbook.meta.lastOpenedEntry) {
      try {
        const entry = await loadEntry(
          fs,
          commonbook,
          commonbook.meta.lastOpenedEntry,
        );
        currentEntry = entry;
        Editor.setContent(view, entry.content);
        updateTitle();
        view.focus();
        return;
      } catch {
        // Entry doesn't exist anymore, create a new one
        const entry = await createEntry(fs, commonbook);
        currentEntry = entry;
        commonbook.meta.lastOpenedEntry = entry.path;
        await saveCommonbookMeta(fs, commonbook);
        Editor.setContent(view, entry.content);
        updateTitle();
        view.focus();
        return;
      }
    } else {
      // No last entry, create one
      const entry = await createEntry(fs, commonbook);
      currentEntry = entry;
      commonbook.meta.lastOpenedEntry = entry.path;
      await saveCommonbookMeta(fs, commonbook);
      Editor.setContent(view, entry.content);
      updateTitle();
      view.focus();
      return;
    }
  }

  // No previous commonbook - show welcome dialog
  showWelcomeDialog();
  updateTitle();
}

startup();

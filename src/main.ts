import "./style.css";
import "prosemirror-view/style/prosemirror.css";
import * as Editor from "./editor/editor";
import { LocalFileSystemProvider } from "./storage/filesystem";
import {
  createNote,
  extractTitle,
  listNotes,
  loadNote,
  type Note,
  saveNote,
} from "./storage/note";
import {
  createNotebook,
  type Notebook,
  openNotebook,
  reconnectNotebook,
  restoreNotebook,
  saveNotebookMeta,
} from "./storage/notebook";

// File system provider
const fs = new LocalFileSystemProvider();

// Current state
let currentNotebook: Notebook | null = null;
let currentNote: Note | null = null;
let pendingReconnectHandle: FileSystemDirectoryHandle | null = null;

function updateTitle() {
  if (!currentNotebook) {
    document.title = "Reflection Notes";
    return;
  }
  const noteTitle = currentNote
    ? extractTitle(currentNote.content)
    : "Untitled";
  document.title = `${noteTitle} - ${currentNotebook.name}`;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app not found");

app.innerHTML = `
  <div class="layout">
    <header class="menubar">
      <div class="menu">
        File
        <div class="menu-dropdown">
          <div class="menu-item" id="file-new-note">New Note</div>
          <div class="menu-item" id="file-open-note">Open Note...</div>
          <div class="menu-separator"></div>
          <div class="menu-item" id="file-new-notebook">New Notebook...</div>
          <div class="menu-item" id="file-open-notebook">Open Notebook...</div>
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
      <h1>Welcome to Reflection Notes</h1>
      <p>Create a new notebook or open an existing one to get started.</p>
      <div class="welcome-buttons">
        <button id="welcome-new">New Notebook</button>
        <button id="welcome-open">Open Notebook</button>
      </div>
    </div>
  </div>

  <div class="welcome-dialog hidden" id="reconnect-dialog">
    <div class="welcome-content">
      <h1>Reconnect to Notebook</h1>
      <p>Click below to reconnect to <strong id="reconnect-name"></strong>.</p>
      <p class="reconnect-hint">Install as an app to skip this step in the future.</p>
      <div class="welcome-buttons">
        <button id="reconnect-button">Reconnect</button>
        <button id="reconnect-different">Open Different Notebook</button>
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

async function handleNewNote() {
  if (!currentNotebook) return;

  // Save current note first
  await saveCurrentNote();

  // Create new note
  const note = await createNote(fs, currentNotebook);
  currentNote = note;

  // Update notebook meta
  currentNotebook.meta.lastOpenedNote = note.path;
  await saveNotebookMeta(fs, currentNotebook);

  // Load into editor
  Editor.setContent(view, note.content);
  updateTitle();
  view.focus();
}

async function handleOpenNote() {
  if (!currentNotebook) return;

  const notes = await listNotes(fs, currentNotebook);
  if (notes.length === 0) {
    alert("No notes in this notebook.");
    return;
  }

  // Format note list for display
  const formatDate = (ts: number) => {
    if (!ts) return "Unknown date";
    return new Date(ts).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const choices = notes
    .map((e, i) => {
      const title =
        e.title === "Untitled"
          ? `Untitled - ${formatDate(e.created)}`
          : e.title;
      return `${i + 1}. ${title}`;
    })
    .join("\n");

  const choice = prompt(`Open note:\n${choices}\n\nEnter number:`);
  if (!choice) return;

  const index = parseInt(choice, 10) - 1;
  if (index < 0 || index >= notes.length) {
    alert("Invalid choice.");
    return;
  }

  // Save current note first
  await saveCurrentNote();

  // Load selected note
  const noteInfo = notes[index];
  const note = await loadNote(fs, currentNotebook, noteInfo.path);
  currentNote = note;

  // Update notebook meta
  currentNotebook.meta.lastOpenedNote = note.path;
  await saveNotebookMeta(fs, currentNotebook);

  // Load into editor
  Editor.setContent(view, note.content);
  updateTitle();
  view.focus();
}

async function handleNewNotebook() {
  try {
    // Save current note first
    await saveCurrentNote();

    const { notebook, note } = await createNotebook(fs);
    currentNotebook = notebook;
    currentNote = note;

    Editor.setContent(view, note.content);
    updateTitle();
    hideWelcomeDialog();
    view.focus();
  } catch (e) {
    if (e instanceof Error) {
      alert(e.message);
    }
  }
}

async function handleOpenNotebook() {
  try {
    // Save current note first
    await saveCurrentNote();

    const notebook = await openNotebook(fs);
    currentNotebook = notebook;

    // Load last opened note, or create a new one
    if (notebook.meta.lastOpenedNote) {
      try {
        const note = await loadNote(fs, notebook, notebook.meta.lastOpenedNote);
        currentNote = note;
        Editor.setContent(view, note.content);
      } catch {
        // Last note doesn't exist, create a new one
        const note = await createNote(fs, notebook);
        currentNote = note;
        notebook.meta.lastOpenedNote = note.path;
        await saveNotebookMeta(fs, notebook);
        Editor.setContent(view, note.content);
      }
    } else {
      // No last note, create a new one
      const note = await createNote(fs, notebook);
      currentNote = note;
      notebook.meta.lastOpenedNote = note.path;
      await saveNotebookMeta(fs, notebook);
      Editor.setContent(view, note.content);
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

async function saveCurrentNote() {
  if (!currentNotebook || !currentNote) return;

  currentNote.content = view.state.doc.toJSON();
  await saveNote(fs, currentNotebook, currentNote);
}

document
  .querySelector("#file-new-note")
  ?.addEventListener("click", handleNewNote);
document
  .querySelector("#file-open-note")
  ?.addEventListener("click", handleOpenNote);
document
  .querySelector("#file-new-notebook")
  ?.addEventListener("click", handleNewNotebook);
document
  .querySelector("#file-open-notebook")
  ?.addEventListener("click", handleOpenNotebook);

// Welcome dialog handlers
document
  .querySelector("#welcome-new")
  ?.addEventListener("click", handleNewNotebook);
document
  .querySelector("#welcome-open")
  ?.addEventListener("click", handleOpenNotebook);

// Reconnect dialog handlers
document
  .querySelector("#reconnect-button")
  ?.addEventListener("click", handleReconnect);
document
  .querySelector("#reconnect-different")
  ?.addEventListener("click", handleReconnectDifferent);

function showWelcomeDialog() {
  document.querySelector("#welcome-dialog")?.classList.remove("hidden");
}

function hideWelcomeDialog() {
  document.querySelector("#welcome-dialog")?.classList.add("hidden");
}

function showReconnectDialog(name: string) {
  const nameEl = document.querySelector("#reconnect-name");
  if (nameEl) nameEl.textContent = name;
  document.querySelector("#reconnect-dialog")?.classList.remove("hidden");
}

function hideReconnectDialog() {
  document.querySelector("#reconnect-dialog")?.classList.add("hidden");
}

async function handleReconnect() {
  if (!pendingReconnectHandle) return;

  try {
    const notebook = await reconnectNotebook(fs, pendingReconnectHandle);
    if (!notebook) {
      alert(
        "Permission denied. Please try again or open a different notebook.",
      );
      return;
    }

    pendingReconnectHandle = null;
    currentNotebook = notebook;

    // Load last opened note, or create a new one
    if (notebook.meta.lastOpenedNote) {
      try {
        const note = await loadNote(fs, notebook, notebook.meta.lastOpenedNote);
        currentNote = note;
        Editor.setContent(view, note.content);
      } catch {
        // Last note doesn't exist, create a new one
        const note = await createNote(fs, notebook);
        currentNote = note;
        notebook.meta.lastOpenedNote = note.path;
        await saveNotebookMeta(fs, notebook);
        Editor.setContent(view, note.content);
      }
    } else {
      // No last note, create a new one
      const note = await createNote(fs, notebook);
      currentNote = note;
      notebook.meta.lastOpenedNote = note.path;
      await saveNotebookMeta(fs, notebook);
      Editor.setContent(view, note.content);
    }

    updateTitle();
    hideReconnectDialog();
    view.focus();
  } catch (e) {
    if (e instanceof Error) {
      alert(e.message);
    }
  }
}

async function handleReconnectDifferent() {
  pendingReconnectHandle = null;
  hideReconnectDialog();
  await handleOpenNotebook();
}

// Autosave: save after changes, debounced
let autosaveTimeout: number | null = null;

function scheduleAutosave() {
  if (!currentNotebook || !currentNote) return;

  if (autosaveTimeout) {
    clearTimeout(autosaveTimeout);
  }

  autosaveTimeout = window.setTimeout(async () => {
    await saveCurrentNote();
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

// Startup: try to restore previous notebook
async function startup() {
  const result = await restoreNotebook(fs);

  if (result) {
    const { notebook, needsPermission } = result;

    // If permission is needed, show reconnect dialog
    if (needsPermission) {
      pendingReconnectHandle = notebook.handle;
      showReconnectDialog(notebook.name);
      updateTitle();
      return;
    }

    // Permission granted - load normally
    currentNotebook = notebook;

    // Load last opened note
    if (notebook.meta.lastOpenedNote) {
      try {
        const note = await loadNote(fs, notebook, notebook.meta.lastOpenedNote);
        currentNote = note;
        Editor.setContent(view, note.content);
        updateTitle();
        view.focus();
        return;
      } catch {
        // Note doesn't exist anymore, create a new one
        const note = await createNote(fs, notebook);
        currentNote = note;
        notebook.meta.lastOpenedNote = note.path;
        await saveNotebookMeta(fs, notebook);
        Editor.setContent(view, note.content);
        updateTitle();
        view.focus();
        return;
      }
    } else {
      // No last note, create one
      const note = await createNote(fs, notebook);
      currentNote = note;
      notebook.meta.lastOpenedNote = note.path;
      await saveNotebookMeta(fs, notebook);
      Editor.setContent(view, note.content);
      updateTitle();
      view.focus();
      return;
    }
  }

  // No previous notebook - show welcome dialog
  showWelcomeDialog();
  updateTitle();
}

startup();

import "./style.css";
import "prosemirror-view/style/prosemirror.css";
import { registerSW } from "virtual:pwa-register";
import * as Editor from "./editor/editor";
import { LocalFileSystemProvider } from "./storage/filesystem";

// Register service worker and handle updates
const updateSW = registerSW({
  onNeedRefresh() {
    showUpdateBanner();
  },
});

function showUpdateBanner() {
  const banner = document.createElement("div");
  banner.className = "update-banner";
  banner.innerHTML = `
    <span>A new version is available</span>
    <button id="update-refresh">Refresh</button>
    <button id="update-dismiss">Dismiss</button>
  `;
  document.body.appendChild(banner);

  document.getElementById("update-refresh")?.addEventListener("click", () => {
    updateSW(true);
  });

  document.getElementById("update-dismiss")?.addEventListener("click", () => {
    banner.remove();
  });
}

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
              <div class="menu-item" id="format-strikethrough">Strikethrough</div>
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

    <div class="toolbar" id="toolbar">
      <div class="toolbar-group">
        <button class="toolbar-btn" id="tb-undo" title="Undo">
          <svg viewBox="0 0 24 24"><path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-redo" title="Redo">
          <svg viewBox="0 0 24 24"><path d="M15 14l4 -4l-4 -4"/><path d="M19 10h-11a4 4 0 1 0 0 8h1"/></svg>
        </button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn" id="tb-bold" title="Strong">
          <svg viewBox="0 0 24 24"><path d="M7 5h6a3.5 3.5 0 0 1 0 7h-6z"/><path d="M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-italic" title="Emphasis">
          <svg viewBox="0 0 24 24"><path d="M11 5l6 0"/><path d="M7 19l6 0"/><path d="M14 5l-4 14"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-code" title="Inline Code">
          <svg viewBox="0 0 24 24"><path d="M7 8l-4 4l4 4"/><path d="M17 8l4 4l-4 4"/><path d="M14 4l-4 16"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-strikethrough" title="Strikethrough">
          <svg viewBox="0 0 24 24"><path d="M5 12l14 0"/><path d="M16 6.5a4 2 0 0 0 -4 -1.5h-1a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-1.5a4 2 0 0 1 -4 -1.5"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-link" title="Link">
          <svg viewBox="0 0 24 24"><path d="M9 15l6 -6"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/></svg>
        </button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn" id="tb-paragraph" title="Paragraph">
          <svg viewBox="0 0 24 24"><path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4h-9.5a4.5 4.5 0 0 0 0 9h3.5"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-h1" title="Section">
          <svg viewBox="0 0 24 24"><path d="M7 12h10"/><path d="M7 5v14"/><path d="M17 5v14"/><path d="M15 19h4"/><path d="M15 5h4"/><path d="M5 19h4"/><path d="M5 5h4"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-h2" title="Subsection">
          <svg viewBox="0 0 24 24"><path d="M17 12a2 2 0 1 1 4 0c0 .591 -.417 1.318 -.816 1.858l-3.184 4.143l4 0"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-h3" title="Subsubsection">
          <svg viewBox="0 0 24 24"><path d="M19 14a2 2 0 1 0 -2 -2"/><path d="M17 16a2 2 0 1 0 2 -2"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-h4" title="Subsubsubsection">
          <svg viewBox="0 0 24 24"><path d="M20 18v-8l-4 6h5"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-code-block" title="Code Block">
          <svg viewBox="0 0 24 24"><path d="M14.5 4h2.5a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3v-5"/><path d="M6 5l-2 2l2 2"/><path d="M10 9l2 -2l-2 -2"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-hr" title="Horizontal Rule">
          <svg viewBox="0 0 24 24"><path d="M4 12l16 0"/><path d="M8 8l4 -4l4 4"/><path d="M16 16l-4 4l-4 -4"/></svg>
        </button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn" id="tb-blockquote" title="Block Quote">
          <svg viewBox="0 0 24 24"><path d="M6 15h15"/><path d="M21 19h-15"/><path d="M15 11h6"/><path d="M21 7h-6"/><path d="M9 9h1a1 1 0 1 1 -1 1v-2.5a2 2 0 0 1 2 -2"/><path d="M3 9h1a1 1 0 1 1 -1 1v-2.5a2 2 0 0 1 2 -2"/></svg>
        </button>
      </div>
    </div>

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

document
  .querySelector("#format-strikethrough")
  ?.addEventListener("click", () => {
    Editor.toggleStrikethrough(view);
    view.focus();
  });

document.querySelector("#format-link")?.addEventListener("click", () => {
  const href = prompt("Enter URL:");
  if (href) {
    Editor.toggleLink(view, href);
  }
  view.focus();
});

// Toolbar - inline marks
document.querySelector("#tb-bold")?.addEventListener("click", () => {
  Editor.toggleStrong(view);
  view.focus();
});

document.querySelector("#tb-italic")?.addEventListener("click", () => {
  Editor.toggleEm(view);
  view.focus();
});

document.querySelector("#tb-code")?.addEventListener("click", () => {
  Editor.toggleCode(view);
  view.focus();
});

document.querySelector("#tb-strikethrough")?.addEventListener("click", () => {
  Editor.toggleStrikethrough(view);
  view.focus();
});

document.querySelector("#tb-link")?.addEventListener("click", () => {
  const href = prompt("Enter URL:");
  if (href) {
    Editor.toggleLink(view, href);
  }
  view.focus();
});

// Toolbar - block types
document.querySelector("#tb-paragraph")?.addEventListener("click", () => {
  Editor.setParagraph(view);
  view.focus();
});

document.querySelector("#tb-h1")?.addEventListener("click", () => {
  Editor.setSection(view, 1);
  view.focus();
});

document.querySelector("#tb-h2")?.addEventListener("click", () => {
  Editor.setSection(view, 2);
  view.focus();
});

document.querySelector("#tb-h3")?.addEventListener("click", () => {
  Editor.setSection(view, 3);
  view.focus();
});

document.querySelector("#tb-h4")?.addEventListener("click", () => {
  Editor.setSection(view, 4);
  view.focus();
});

document.querySelector("#tb-blockquote")?.addEventListener("click", () => {
  Editor.setBlockquote(view);
  view.focus();
});

document.querySelector("#tb-code-block")?.addEventListener("click", () => {
  Editor.setCodeBlock(view);
  view.focus();
});

document.querySelector("#tb-hr")?.addEventListener("click", () => {
  Editor.insertHorizontalRule(view);
  view.focus();
});

// Toolbar - history
document.querySelector("#tb-undo")?.addEventListener("click", () => {
  Editor.doUndo(view);
  view.focus();
});

document.querySelector("#tb-redo")?.addEventListener("click", () => {
  Editor.doRedo(view);
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

// Toolbar state tracking
const tbBold = document.querySelector<HTMLButtonElement>("#tb-bold");
const tbItalic = document.querySelector<HTMLButtonElement>("#tb-italic");
const tbCode = document.querySelector<HTMLButtonElement>("#tb-code");
const tbStrikethrough =
  document.querySelector<HTMLButtonElement>("#tb-strikethrough");
const tbLink = document.querySelector<HTMLButtonElement>("#tb-link");
const tbParagraph = document.querySelector<HTMLButtonElement>("#tb-paragraph");
const tbH1 = document.querySelector<HTMLButtonElement>("#tb-h1");
const tbH2 = document.querySelector<HTMLButtonElement>("#tb-h2");
const tbH3 = document.querySelector<HTMLButtonElement>("#tb-h3");
const tbH4 = document.querySelector<HTMLButtonElement>("#tb-h4");
const tbBlockquote =
  document.querySelector<HTMLButtonElement>("#tb-blockquote");
const tbCodeBlock = document.querySelector<HTMLButtonElement>("#tb-code-block");

function updateToolbarState() {
  // Update inline mark buttons
  const marks = Editor.getActiveMarks(view);
  tbBold?.classList.toggle("active", marks.strong);
  tbItalic?.classList.toggle("active", marks.em);
  tbCode?.classList.toggle("active", marks.code);
  tbStrikethrough?.classList.toggle("active", marks.strikethrough);
  tbLink?.classList.toggle("active", marks.link);

  // Update block type buttons
  const blockType = Editor.getBlockTypeName(view);
  tbParagraph?.classList.toggle("active", blockType === "Paragraph");
  tbH1?.classList.toggle("active", blockType === "Section");
  tbH2?.classList.toggle("active", blockType === "Subsection");
  tbH3?.classList.toggle("active", blockType === "Subsubsection");
  tbH4?.classList.toggle("active", blockType === "Subsubsubsection");
  tbCodeBlock?.classList.toggle("active", blockType === "Code Block");

  // Blockquote is a container - show active when cursor is inside one
  tbBlockquote?.classList.toggle("active", Editor.isInsideBlockquote(view));
}

Editor.onSelectionChange(view, () => {
  updateFormatIndicator();
  updateToolbarState();
});
updateFormatIndicator();
updateToolbarState();

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

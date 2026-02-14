import "./style.css";
import "prosemirror-view/style/prosemirror.css";
import "katex/dist/katex.min.css";
import { registerSW } from "virtual:pwa-register";
import {
  type AppState,
  canSaveNote,
  getDocumentTitle,
  getNote,
  getNotebook,
  initialState,
  transition,
} from "./appState";
import { AutosaveManager } from "./autosave";
import * as Editor from "./editor/editor";
import { ImageManager, setImageManager } from "./editor/ImageManager";
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
  loadNoteOrCreateDefault,
  saveNote,
} from "./storage/note";
import {
  createNotebook,
  openNotebook,
  reconnectNotebook,
  restoreNotebook,
  saveNotebookMeta,
} from "./storage/notebook";

// File system provider
const fs = new LocalFileSystemProvider();

// Application state - explicit state machine
let appState: AppState = initialState();

function updateTitle() {
  document.title = getDocumentTitle(appState, extractTitle);
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
              <div class="menu-item" id="format-code-block">Code Block</div>
              <div class="menu-item" id="format-hr">Horizontal Rule</div>
              <div class="menu-separator"></div>
              <div class="menu-item" id="format-blockquote">Block Quote</div>
              <div class="menu-item" id="format-bullet-list">Bullet List</div>
              <div class="menu-item" id="format-ordered-list">Ordered List</div>
            </div>
          </div>
        </div>
      </div>
      <div class="menu">View</div>
      <div class="menu">Preferences</div>
      <div class="menu">Help</div>
    </header>

    <!-- Toolbar icons from Tabler Icons (tabler.io/icons, MIT license)
         tb-undo: arrow-back-up
         tb-redo: arrow-forward-up
         tb-bold: bold
         tb-italic: italic
         tb-code: code
         tb-strikethrough: strikethrough
         tb-link: link
         tb-paragraph: pilcrow
         tb-h1: custom (seriffed H, not Tabler's h-1 which has the digit)
         tb-h2: h-3
         tb-h3: h-4
         tb-h4: h-5
         tb-code-block: source-code
         tb-hr: separator-horizontal
         tb-blockquote: blockquote
         tb-bullet-list: list
         tb-ordered-list: list-numbers
    -->
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
          <svg viewBox="0 0 24 24"><path d="M19 14a2 2 0 1 0 -2 -2"/><path d="M17 16a2 2 0 1 0 2 -2"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-h3" title="Subsubsection">
          <svg viewBox="0 0 24 24"><path d="M20 18v-8l-4 6h5"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-h4" title="Subsubsubsection">
          <svg viewBox="0 0 24 24"><path d="M17 18h2a2 2 0 1 0 0 -4h-2v-4h4"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>
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
        <button class="toolbar-btn" id="tb-bullet-list" title="Bullet List">
          <svg viewBox="0 0 24 24"><path d="M9 6l11 0"/><path d="M9 12l11 0"/><path d="M9 18l11 0"/><path d="M5 6l0 .01"/><path d="M5 12l0 .01"/><path d="M5 18l0 .01"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-ordered-list" title="Ordered List">
          <svg viewBox="0 0 24 24"><path d="M11 6h9"/><path d="M11 12h9"/><path d="M12 18h8"/><path d="M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4"/><path d="M6 10v-6l-2 2"/></svg>
        </button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn" id="tb-image" title="Image">
          <svg viewBox="0 0 24 24"><path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/></svg>
        </button>
        <button class="toolbar-btn" id="tb-math" title="Math Block">
          <svg viewBox="0 0 24 24"><path d="M19 5h-7l-4 14l-3 -6h-2"/><path d="M14 13l6 6"/><path d="M14 19l6 -6"/></svg>
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

// Set up copy handler for proper image clipboard handling
Editor.setupCopyHandler(view);

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

document.querySelector("#format-bullet-list")?.addEventListener("click", () => {
  Editor.toggleBulletList(view);
  view.focus();
});

document
  .querySelector("#format-ordered-list")
  ?.addEventListener("click", () => {
    Editor.toggleOrderedList(view);
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

document.querySelector("#tb-bullet-list")?.addEventListener("click", () => {
  Editor.toggleBulletList(view);
  view.focus();
});

document.querySelector("#tb-ordered-list")?.addEventListener("click", () => {
  Editor.toggleOrderedList(view);
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

document.querySelector("#tb-math")?.addEventListener("click", () => {
  Editor.insertMathDisplay(view);
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
  const notebook = getNotebook(appState);
  if (!notebook) return;

  // Flush any pending autosave before switching notes
  await autosaveManager.flush();

  // Create new note
  const note = await createNote(fs, notebook);

  // Transition state
  const newState = transition(appState, { type: "switch_note", note });
  if (!newState) return;
  appState = newState;

  // Update notebook meta
  notebook.meta.lastOpenedNote = note.path;
  await saveNotebookMeta(fs, notebook);

  // Load into editor
  setupImageManager();
  Editor.setContent(view, note.content);
  updateTitle();
  view.focus();
}

async function handleOpenNote() {
  const notebook = getNotebook(appState);
  if (!notebook) return;

  const notes = await listNotes(fs, notebook);
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

  // Flush any pending autosave before switching notes
  await autosaveManager.flush();

  // Load selected note
  const noteInfo = notes[index];
  const note = await loadNote(fs, notebook, noteInfo.path);

  // Transition state
  const newState = transition(appState, { type: "switch_note", note });
  if (!newState) return;
  appState = newState;

  // Update notebook meta
  notebook.meta.lastOpenedNote = note.path;
  await saveNotebookMeta(fs, notebook);

  // Load into editor
  setupImageManager();
  Editor.setContent(view, note.content);
  updateTitle();
  view.focus();
}

async function handleNewNotebook() {
  try {
    // Flush any pending autosave before switching notebooks
    await autosaveManager.flush();

    const { notebook, note } = await createNotebook(fs);

    // Transition state
    const newState = transition(appState, {
      type: "open_notebook",
      notebook,
      note,
    });
    if (!newState) return;
    appState = newState;

    setupImageManager();
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
    // Flush any pending autosave before switching notebooks
    await autosaveManager.flush();

    const notebook = await openNotebook(fs);

    // Load last opened note, or create a new one
    const { note, didCreate } = await loadNoteOrCreateDefault(
      fs,
      notebook,
      notebook.meta.lastOpenedNote,
    );

    // Transition state
    const newState = transition(appState, {
      type: "open_notebook",
      notebook,
      note,
    });
    if (!newState) return;
    appState = newState;

    if (didCreate) {
      notebook.meta.lastOpenedNote = note.path;
      await saveNotebookMeta(fs, notebook);
    }

    setupImageManager();
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

async function saveCurrentNote() {
  if (!canSaveNote(appState)) return;

  const notebook = getNotebook(appState);
  const note = getNote(appState);
  if (!notebook || !note) return;

  note.content = view.state.doc.toJSON();
  await saveNote(fs, notebook, note);
}

// Current ImageManager for the loaded note
let imageManager: ImageManager | null = null;

/**
 * Set up ImageManager for the current note.
 * Disposes the previous ImageManager if one exists.
 * Must be called after loading/creating a note.
 */
function setupImageManager() {
  const notebook = getNotebook(appState);
  const note = getNote(appState);
  if (!notebook || !note) return;

  // Dispose previous ImageManager
  if (imageManager) {
    imageManager.dispose();
  }

  // Create new ImageManager for this note
  imageManager = new ImageManager(fs, notebook, note.path);
  setImageManager(view, imageManager);
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
  if (appState.kind !== "reconnecting") return;

  try {
    const notebook = await reconnectNotebook(fs, appState.handle);
    if (!notebook) {
      alert(
        "Permission denied. Please try again or open a different notebook.",
      );
      return;
    }

    // Load last opened note, or create a new one
    const { note, didCreate } = await loadNoteOrCreateDefault(
      fs,
      notebook,
      notebook.meta.lastOpenedNote,
    );

    // Transition state
    const newState = transition(appState, {
      type: "reconnected",
      notebook,
      note,
    });
    if (!newState) return;
    appState = newState;

    if (didCreate) {
      notebook.meta.lastOpenedNote = note.path;
      await saveNotebookMeta(fs, notebook);
    }

    setupImageManager();
    Editor.setContent(view, note.content);
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
  // Cancel reconnect and let user choose different notebook
  const newState = transition(appState, { type: "cancel_reconnect" });
  if (newState) {
    appState = newState;
  }
  hideReconnectDialog();
  await handleOpenNotebook();
}

// Autosave: explicit state machine for debounced saves
const autosaveManager = new AutosaveManager({
  delayMs: 1000,
  save: async () => {
    await saveCurrentNote();
  },
  onAfterSave: () => {
    // Update title in case it changed
    updateTitle();
  },
});

// Listen for editor changes
Editor.onChange(view, () => {
  if (canSaveNote(appState)) {
    autosaveManager.schedule();
  }
});

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
const tbBulletList =
  document.querySelector<HTMLButtonElement>("#tb-bullet-list");
const tbOrderedList =
  document.querySelector<HTMLButtonElement>("#tb-ordered-list");
const tbCodeBlock = document.querySelector<HTMLButtonElement>("#tb-code-block");
const tbImage = document.querySelector<HTMLButtonElement>("#tb-image");

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

  // Container blocks - show active when cursor is inside one
  tbBlockquote?.classList.toggle("active", Editor.isInsideBlockquote(view));
  tbBulletList?.classList.toggle("active", Editor.isInsideBulletList(view));
  tbOrderedList?.classList.toggle("active", Editor.isInsideOrderedList(view));

  // Image button - show active when image is selected
  tbImage?.classList.toggle("active", Editor.isImageSelected(view));
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
      const newState = transition(appState, {
        type: "needs_reconnect",
        handle: notebook.handle,
        notebookName: notebook.name,
      });
      if (newState) {
        appState = newState;
      }
      showReconnectDialog(notebook.name);
      updateTitle();
      return;
    }

    // Permission granted - load normally
    // Load last opened note, or create a new one
    const { note, didCreate } = await loadNoteOrCreateDefault(
      fs,
      notebook,
      notebook.meta.lastOpenedNote,
    );

    const newState = transition(appState, {
      type: "open_notebook",
      notebook,
      note,
    });
    if (newState) {
      appState = newState;
    }

    if (didCreate) {
      notebook.meta.lastOpenedNote = note.path;
      await saveNotebookMeta(fs, notebook);
    }

    setupImageManager();
    Editor.setContent(view, note.content);
    updateTitle();
    view.focus();
    return;
  }

  // No previous notebook - show welcome dialog
  showWelcomeDialog();
  updateTitle();
}

startup();

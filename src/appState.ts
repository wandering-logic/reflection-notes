/**
 * Explicit application state machine.
 *
 * The app has three distinct states:
 * - welcome: No notebook open, showing welcome dialog
 * - reconnecting: Previous notebook found but needs permission re-grant
 * - loaded: Notebook and note are loaded, editor is active
 *
 * This replaces the implicit state spread across multiple nullable variables.
 */

import type { Note } from "./storage/note";
import type { Notebook } from "./storage/notebook";

/**
 * Application state as a discriminated union.
 */
export type AppState =
  | { kind: "welcome" }
  | {
      kind: "reconnecting";
      handle: FileSystemDirectoryHandle;
      notebookName: string;
    }
  | { kind: "loaded"; notebook: Notebook; note: Note };

/**
 * Events that can trigger state transitions.
 */
export type AppEvent =
  | { type: "open_notebook"; notebook: Notebook; note: Note }
  | {
      type: "needs_reconnect";
      handle: FileSystemDirectoryHandle;
      notebookName: string;
    }
  | { type: "reconnected"; notebook: Notebook; note: Note }
  | { type: "switch_note"; note: Note }
  | { type: "cancel_reconnect" };

/**
 * Pure state transition function.
 * Returns the new state, or null if the transition is invalid.
 */
export function transition(state: AppState, event: AppEvent): AppState | null {
  switch (event.type) {
    case "open_notebook":
      // Can open notebook from welcome or reconnecting (user chose different notebook)
      if (state.kind === "welcome" || state.kind === "reconnecting") {
        return { kind: "loaded", notebook: event.notebook, note: event.note };
      }
      // From loaded state, switching notebooks is also valid
      if (state.kind === "loaded") {
        return { kind: "loaded", notebook: event.notebook, note: event.note };
      }
      return null;

    case "needs_reconnect":
      // Only valid from welcome state (during startup restore)
      if (state.kind === "welcome") {
        return {
          kind: "reconnecting",
          handle: event.handle,
          notebookName: event.notebookName,
        };
      }
      return null;

    case "reconnected":
      // Only valid from reconnecting state
      if (state.kind === "reconnecting") {
        return { kind: "loaded", notebook: event.notebook, note: event.note };
      }
      return null;

    case "switch_note":
      // Only valid when loaded
      if (state.kind === "loaded") {
        return { kind: "loaded", notebook: state.notebook, note: event.note };
      }
      return null;

    case "cancel_reconnect":
      // Only valid from reconnecting state
      if (state.kind === "reconnecting") {
        return { kind: "welcome" };
      }
      return null;
  }
}

/**
 * Create the initial welcome state.
 */
export function initialState(): AppState {
  return { kind: "welcome" };
}

// State queries - pure functions for deriving information from state

/**
 * Check if a note can be created (requires loaded state).
 */
export function canCreateNote(state: AppState): boolean {
  return state.kind === "loaded";
}

/**
 * Check if a note can be opened (requires loaded state).
 */
export function canOpenNote(state: AppState): boolean {
  return state.kind === "loaded";
}

/**
 * Check if the current note can be saved (requires loaded state).
 */
export function canSaveNote(state: AppState): boolean {
  return state.kind === "loaded";
}

/**
 * Get the current notebook, if any.
 */
export function getNotebook(state: AppState): Notebook | null {
  return state.kind === "loaded" ? state.notebook : null;
}

/**
 * Get the current note, if any.
 */
export function getNote(state: AppState): Note | null {
  return state.kind === "loaded" ? state.note : null;
}

/**
 * Get the document title based on current state.
 */
export function getDocumentTitle(
  state: AppState,
  extractTitle: (content: unknown) => string,
): string {
  if (state.kind !== "loaded") {
    return "Reflection Notes";
  }
  const noteTitle = extractTitle(state.note.content);
  return `${noteTitle} - ${state.notebook.name}`;
}

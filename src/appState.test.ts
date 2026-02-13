import { describe, expect, it } from "vitest";
import {
  type AppState,
  canCreateNote,
  canOpenNote,
  canSaveNote,
  getDocumentTitle,
  getNote,
  getNotebook,
  initialState,
  transition,
} from "./appState";
import type { Note } from "./storage/note";
import type { Notebook } from "./storage/notebook";

// Mock data for testing
const mockHandle = {} as FileSystemDirectoryHandle;

const mockNotebook: Notebook = {
  handle: mockHandle,
  name: "Test Notebook",
  meta: { version: 1, lastOpenedNote: null },
};

const mockNote: Note = {
  path: "2026/02/11/1",
  content: { type: "doc", content: [{ type: "title" }] },
};

const mockNote2: Note = {
  path: "2026/02/11/2",
  content: { type: "doc", content: [{ type: "title" }] },
};

describe("AppState", () => {
  describe("initialState", () => {
    it("returns welcome state", () => {
      expect(initialState()).toEqual({ kind: "welcome" });
    });
  });

  describe("transition", () => {
    describe("from welcome state", () => {
      const welcomeState: AppState = { kind: "welcome" };

      it("open_notebook -> loaded", () => {
        const result = transition(welcomeState, {
          type: "open_notebook",
          notebook: mockNotebook,
          note: mockNote,
        });
        expect(result).toEqual({
          kind: "loaded",
          notebook: mockNotebook,
          note: mockNote,
        });
      });

      it("needs_reconnect -> reconnecting", () => {
        const result = transition(welcomeState, {
          type: "needs_reconnect",
          handle: mockHandle,
          notebookName: "My Notebook",
        });
        expect(result).toEqual({
          kind: "reconnecting",
          handle: mockHandle,
          notebookName: "My Notebook",
        });
      });

      it("switch_note is invalid", () => {
        const result = transition(welcomeState, {
          type: "switch_note",
          note: mockNote,
        });
        expect(result).toBeNull();
      });

      it("reconnected is invalid", () => {
        const result = transition(welcomeState, {
          type: "reconnected",
          notebook: mockNotebook,
          note: mockNote,
        });
        expect(result).toBeNull();
      });

      it("cancel_reconnect is invalid", () => {
        const result = transition(welcomeState, { type: "cancel_reconnect" });
        expect(result).toBeNull();
      });
    });

    describe("from reconnecting state", () => {
      const reconnectingState: AppState = {
        kind: "reconnecting",
        handle: mockHandle,
        notebookName: "Previous Notebook",
      };

      it("reconnected -> loaded", () => {
        const result = transition(reconnectingState, {
          type: "reconnected",
          notebook: mockNotebook,
          note: mockNote,
        });
        expect(result).toEqual({
          kind: "loaded",
          notebook: mockNotebook,
          note: mockNote,
        });
      });

      it("open_notebook -> loaded (user chose different notebook)", () => {
        const result = transition(reconnectingState, {
          type: "open_notebook",
          notebook: mockNotebook,
          note: mockNote,
        });
        expect(result).toEqual({
          kind: "loaded",
          notebook: mockNotebook,
          note: mockNote,
        });
      });

      it("cancel_reconnect -> welcome", () => {
        const result = transition(reconnectingState, {
          type: "cancel_reconnect",
        });
        expect(result).toEqual({ kind: "welcome" });
      });

      it("switch_note is invalid", () => {
        const result = transition(reconnectingState, {
          type: "switch_note",
          note: mockNote,
        });
        expect(result).toBeNull();
      });

      it("needs_reconnect is invalid", () => {
        const result = transition(reconnectingState, {
          type: "needs_reconnect",
          handle: mockHandle,
          notebookName: "Another",
        });
        expect(result).toBeNull();
      });
    });

    describe("from loaded state", () => {
      const loadedState: AppState = {
        kind: "loaded",
        notebook: mockNotebook,
        note: mockNote,
      };

      it("switch_note -> loaded with new note", () => {
        const result = transition(loadedState, {
          type: "switch_note",
          note: mockNote2,
        });
        expect(result).toEqual({
          kind: "loaded",
          notebook: mockNotebook,
          note: mockNote2,
        });
      });

      it("open_notebook -> loaded with new notebook", () => {
        const newNotebook: Notebook = {
          ...mockNotebook,
          name: "New Notebook",
        };
        const result = transition(loadedState, {
          type: "open_notebook",
          notebook: newNotebook,
          note: mockNote2,
        });
        expect(result).toEqual({
          kind: "loaded",
          notebook: newNotebook,
          note: mockNote2,
        });
      });

      it("needs_reconnect is invalid", () => {
        const result = transition(loadedState, {
          type: "needs_reconnect",
          handle: mockHandle,
          notebookName: "Another",
        });
        expect(result).toBeNull();
      });

      it("reconnected is invalid", () => {
        const result = transition(loadedState, {
          type: "reconnected",
          notebook: mockNotebook,
          note: mockNote,
        });
        expect(result).toBeNull();
      });

      it("cancel_reconnect is invalid", () => {
        const result = transition(loadedState, { type: "cancel_reconnect" });
        expect(result).toBeNull();
      });
    });
  });

  describe("state queries", () => {
    const welcomeState: AppState = { kind: "welcome" };
    const reconnectingState: AppState = {
      kind: "reconnecting",
      handle: mockHandle,
      notebookName: "Test",
    };
    const loadedState: AppState = {
      kind: "loaded",
      notebook: mockNotebook,
      note: mockNote,
    };

    describe("canCreateNote", () => {
      it("returns false for welcome state", () => {
        expect(canCreateNote(welcomeState)).toBe(false);
      });

      it("returns false for reconnecting state", () => {
        expect(canCreateNote(reconnectingState)).toBe(false);
      });

      it("returns true for loaded state", () => {
        expect(canCreateNote(loadedState)).toBe(true);
      });
    });

    describe("canOpenNote", () => {
      it("returns false for welcome state", () => {
        expect(canOpenNote(welcomeState)).toBe(false);
      });

      it("returns false for reconnecting state", () => {
        expect(canOpenNote(reconnectingState)).toBe(false);
      });

      it("returns true for loaded state", () => {
        expect(canOpenNote(loadedState)).toBe(true);
      });
    });

    describe("canSaveNote", () => {
      it("returns false for welcome state", () => {
        expect(canSaveNote(welcomeState)).toBe(false);
      });

      it("returns false for reconnecting state", () => {
        expect(canSaveNote(reconnectingState)).toBe(false);
      });

      it("returns true for loaded state", () => {
        expect(canSaveNote(loadedState)).toBe(true);
      });
    });

    describe("getNotebook", () => {
      it("returns null for welcome state", () => {
        expect(getNotebook(welcomeState)).toBeNull();
      });

      it("returns null for reconnecting state", () => {
        expect(getNotebook(reconnectingState)).toBeNull();
      });

      it("returns notebook for loaded state", () => {
        expect(getNotebook(loadedState)).toBe(mockNotebook);
      });
    });

    describe("getNote", () => {
      it("returns null for welcome state", () => {
        expect(getNote(welcomeState)).toBeNull();
      });

      it("returns null for reconnecting state", () => {
        expect(getNote(reconnectingState)).toBeNull();
      });

      it("returns note for loaded state", () => {
        expect(getNote(loadedState)).toBe(mockNote);
      });
    });

    describe("getDocumentTitle", () => {
      const extractTitle = (content: unknown) => {
        // Simple mock that returns a fixed title
        return content ? "Note Title" : "Untitled";
      };

      it("returns app name for welcome state", () => {
        expect(getDocumentTitle(welcomeState, extractTitle)).toBe(
          "Reflection Notes",
        );
      });

      it("returns app name for reconnecting state", () => {
        expect(getDocumentTitle(reconnectingState, extractTitle)).toBe(
          "Reflection Notes",
        );
      });

      it("returns note title and notebook name for loaded state", () => {
        expect(getDocumentTitle(loadedState, extractTitle)).toBe(
          "Note Title - Test Notebook",
        );
      });
    });
  });
});

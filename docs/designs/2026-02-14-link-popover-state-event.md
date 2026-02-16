# Link Popover — State × Event Table

Design artifact for the link URL popover in Reflection Notes.

Companion to: `link-decision-table.md` (what triggers the popover and what
outcomes it produces).

## Popover Description

The popover is a non-modal, inline panel anchored to the caret or selection.
It contains a single URL text field. No buttons, no tabs, no other controls.

## Design Rationale

Ideally, the user would edit the URL directly in-place in the document — the
way you edit a spreadsheet cell or rename a file in a file manager. That's
too disorienting in practice (surrounding text shifts, the URL is a different
kind of data than prose), so the popover is a pragmatic compromise.

Because the popover is a substitute for in-place editing, it inherits
**in-place editing semantics**: navigating away commits your edit, and Esc
is the only way to cancel. This matches the mental model of spreadsheet
cells, Finder/Explorer rename, and browser address bars. Nobody clicks away
from an edited cell and expects it to revert.

The exit key classification follows from a single-line text field metaphor
(per Fitts's Law "slam against the wall" principle — keys that hit the
boundary of what a single-line field can do exit the field rather than
doing nothing):
- Keys that have meaning within a single line of text → stay in field.
- Keys that would move to another line → exit (commit).
- Esc → exit (cancel). The only cancel path.

## States

The popover has two states:

| State | Description |
|-------|-------------|
| **Closed** | Popover not visible. Keyboard focus is in the editor. |
| **Open** | Popover visible. Keyboard focus is in the URL text field. |

## Entry Conditions

When the popover opens, its initial field value depends on context (see
`link-decision-table.md` for full rules):

| Context | Initial field value |
|---------|-------------------|
| Collapsed cursor, no link | Empty |
| Collapsed cursor, inside link | Current href of the contiguous link |
| Selection, no links | Empty |
| Selection touches one link | Current href of that link |
| Selection spans multiple links | Empty |

The popover stores the **initial value** on open so it can detect whether
changes were made.

## Exit Semantics

There are exactly two exit outcomes:

**Commit:**
- If field is non-empty → set href to field contents (create or update link).
- If field is empty → remove link mark (unlink).
- If field is unchanged from initial value → no-op (but still closes).
- See `link-decision-table.md` §1–3 for what "set href" and "remove link"
  mean in each selection context.

**Cancel (Esc only):**
- If the link existed before opening → revert href to initial value, no change.
- If the link was newly created (Ctrl/Cmd-K on unlinked selection) → remove
  the temporary link mark. No ghost links.
- Editor state returns to exactly what it was before Ctrl/Cmd-K.

## Focus Management

| Transition | Focus goes to |
|------------|--------------|
| Editor → Open | URL text field (field is focused, all text selected for easy overwrite) |
| Open → Closed (commit) | Editor, cursor at the end of the linked text |
| Open → Closed (cancel) | Editor, restoring the selection that was active before Ctrl/Cmd-K |

---

## Event Table

### Key: stay in field (intra-line behavior)

These keys behave as they would in a normal single-line text input. They
never exit the popover. At the boundaries they stop (do not exit).

| Event | Behavior in URL field |
|-------|-----------------------|
| **Left arrow** | Move cursor left. No-op at position 0. |
| **Right arrow** | Move cursor right. No-op at end of text. |
| **Ctrl/Cmd+Left** | Move cursor one word left (or to start). |
| **Ctrl/Cmd+Right** | Move cursor one word right (or to end). |
| **Home** | Move cursor to start of field. |
| **End** | Move cursor to end of field. |
| **Shift+Left/Right** | Extend selection within field. |
| **Shift+Home/End** | Extend selection to start/end of field. |
| **Ctrl/Cmd+Shift+Left/Right** | Extend selection by word. |
| **Ctrl/Cmd+A** | Select all text in field. |
| **Backspace** | Delete character left of cursor. No-op at position 0. |
| **Delete** | Delete character right of cursor. No-op at end of text. |
| **Ctrl/Cmd+Backspace** | Delete word left (or to start). |
| **Ctrl/Cmd+Delete** | Delete word right (or to end). |
| **Character keys** | Insert character at cursor. |
| **Ctrl/Cmd+V** | Paste into field. |
| **Ctrl/Cmd+C** | Copy from field. |
| **Ctrl/Cmd+X** | Cut from field. |
| **Ctrl/Cmd+Z** | Undo within field (field-local undo, not editor undo). |

### Key: exit as commit (inter-line behavior)

These keys would move to another line in a normal text editor, so they
exit the popover and commit the current field value.

| Event | Exit type | Rationale |
|-------|-----------|-----------|
| **Enter** | Commit | Explicit confirm. |
| **Ctrl/Cmd-K** | Commit | Toggle: same gesture that opened it closes it. |
| **Tab** | Commit | "Move to next thing" — next thing is editor. |
| **Shift+Tab** | Commit | "Move to previous thing" — still the editor. |
| **Up arrow** | Commit | Would move to previous line; single-line field has none. |
| **Down arrow** | Commit | Would move to next line; single-line field has none. |
| **PgUp** | Commit | Would move up; single-line field boundary. |
| **PgDown** | Commit | Would move down; single-line field boundary. |

### Key: exit as cancel

| Event | Exit type | Rationale |
|-------|-----------|-----------|
| **Esc** | Cancel | Universal cancel gesture. The only cancel path. |

### Mouse events

| Event | Exit type | Rationale |
|-------|-----------|-----------|
| **Click outside popover** | Commit | In-place editing model: navigating away saves. |
| **Click in editor** | Commit | Subset of "click outside." Focus moves to clicked position. |

---

## Edge Cases

### Ctrl/Cmd-K when popover is already open

Commits and closes (toggle behavior). Does not reopen. The user perceives
a single toggle: press to open, press to close.

### Ctrl/Cmd-K on a different link while popover is open

If the user somehow moves focus to the editor and places the cursor on a
different link, then presses Ctrl/Cmd-K: commit the current popover first,
then open a new popover for the new link. (In practice this is unlikely
since focus is in the popover, but it should be handled.)

### Extremely long URLs

The text field should scroll horizontally rather than wrapping or resizing
the popover. Home/End let the user jump to either end.

### Empty field on commit after editing existing link

If the user opened the popover on an existing link, cleared the field, and
pressed Enter: this is an intentional unlink. Remove the link mark. Text
remains.

### Popover and undo

Opening and closing the popover with a committed change should produce a
single entry in the editor's undo history. Ctrl/Cmd-Z in the editor after
closing the popover reverts the link change.

Ctrl/Cmd-Z *inside* the popover is field-local undo (undo edits to the URL
text) and does not affect the editor.

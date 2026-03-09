# Retrospective: Inline Math Node Implementation

## What We Built

Added a `math_inline` node (KaTeX, inline rendering, same popover-editing UX as the existing `math_display` block node). The plan was straightforward: add the schema node, a nodeView, generalize the plugin, wire up the toolbar.

Implementation took one pass. Three bugs surfaced during manual testing that required three follow-up fixes.

---

## Bug 1: Typing one character closed the popover

### What happened

After inserting an inline math node, typing the first character into the textarea caused the popover to close after the 100 ms debounce fired.

### Root cause

`updateNodeContent` calls `state.tr.setNodeMarkup(editingPos, ...)`, which creates a *new node object* to replace the old one. After dispatch, `view.update` in the plugin checks `selection instanceof NodeSelection`. The NodeSelection had been lost.

Why? `NodeSelection.map` uses different logic for block vs inline nodes:

- **Block nodes:** checks `$pos.nodeAfter` — existence only, not identity
- **Inline nodes:** checks `$pos.parent.childBefore($pos.parentOffset).node === this.node` — *object identity*

Since `setNodeMarkup` creates a fresh node object, the identity check always fails for inline nodes, downgrading the selection to a `TextSelection`. `view.update` then saw a non-NodeSelection with `editingPos !== null` and called `hidePopover`.

Fix: after `setNodeMarkup`, explicitly re-assert `NodeSelection.create(tr.doc, editingPos)` on the same transaction.

### Why we missed it

The plan said "The popover logic is identical for inline math" and "reused as-is." This was an assumption, not a verification. The assumption held for the structure of the popover (show/hide, textarea, keyboard handling), but not for a ProseMirror invariant — that the selection type survives a node attribute update differently for block vs inline atoms.

We did say "read the exact plugin code before changing" for the exit navigation path. But `updateNodeContent` wasn't flagged as something that might behave differently for inline nodes. The question "does setNodeMarkup preserve NodeSelection?" was never asked.

---

## Bug 2: Clicking an existing node only showed the popover while holding the mouse

### What happened

Clicking on a rendered inline math formula opened the popover during `mousedown`, but the popover closed on `mouseup`.

This did not happen for `math_display`. It did not happen when inserting via the toolbar button.

### Root cause

ProseMirror's internal mousedown handler marks `mightDrag = true` for draggable atom nodes and sets `delayedSelectionSync = true`. In `MouseDown.done()` (fired on `mouseup`):

```javascript
if (this.delayedSelectionSync) setTimeout(() => selectionBetween(this.view), 20)
```

This fires 20 ms after mouseup. `selectionBetween` reads `view.root.getSelection()` to re-sync the ProseMirror selection from the browser. But `showPopover` had already called `textarea.focus()`, moving focus (and the browser selection) out of the editor. `selectionBetween` saw an empty selection and reset ProseMirror's state to a `TextSelection`. The plugin's `view.update` then called `hidePopover`.

The reason this didn't affect `math_display`: block atom nodes go through the same `mightDrag` path, but the existing `updateNodeContent` bug (Bug 1) never surfaced because `setNodeMarkup` *does* preserve NodeSelection for block nodes. The delayed sync still fires for block nodes, but in practice the NodeSelection survives because `$pos.nodeAfter` is an existence check, not identity.

The reason toolbar insertion didn't trigger it: the toolbar button is outside the editor DOM. No ProseMirror mousedown-within-editor sequence occurred, so `mightDrag` and `delayedSelectionSync` were never set.

Fix: in `view.update`, before calling `hidePopover`, check `document.activeElement !== textarea`. If the textarea still owns focus, the selection change is spurious (we opened the popover and focus moved to the textarea during this same click). Legitimate navigation away — clicking editor text, pressing Escape/Tab — moves focus off the textarea first.

### Why we missed it

The plan's verification steps were:

> Manual: open dev server, insert inline math in a paragraph, verify KaTeX renders inline, select it, edit via popover, escape exits with cursor placed after the node

"Select it" was listed as one step, not as a separate scenario to trace. There are two distinct paths to "select it":
1. Toolbar button → `insertMathInline` → popover opens (no editor mousedown)
2. Click on an existing rendered node → editor mousedown → delayed sync → focus conflict

Only path 2 triggers the bug. The plan's verification tested path 1, then assumed path 2 was equivalent.

The CLAUDE.md principle that applies: *"What happens today? Trace the actual mechanism — don't assume."* We needed to trace "what happens when I click on an already-rendered inline math node" as a distinct flow, not fold it into the general "select it" step.

---

## Bug 3: Popover overlapped the rendered math

### What happened

The popover appeared on top of the inline math node rather than below it.

### Root cause

The popover is appended to `view.dom.parentElement` (the `#editor` div). `#editor` has no `position` CSS property, so `position: absolute` on the popover resolved against the nearest positioned ancestor: `.editor-host` (`position: relative`).

The coordinates were calculated relative to `view.dom`:

```typescript
popover.style.left = `${rect.left - editorRect.left}px`;
popover.style.top  = `${rect.bottom - editorRect.top + 4}px`;
```

The difference between `view.dom`'s top and `.editor-host`'s top is `#editor`'s 12 px padding plus `view.dom`'s own margin/padding. Scroll in `.editor-host` also wasn't accounted for. The result: the popover appeared at the wrong position.

For `math_display` the same bug existed, but block nodes are centered, full-width, and visually prominent — the error was small enough not to notice. For inline nodes, which are small and in-line with text, the offset placed the popover directly on top of the rendered formula.

Fix: switch to `position: fixed` with raw `getBoundingClientRect()` viewport coordinates. This is independent of offset parent, scroll position, and padding.

### Why we missed it

The plan said: "The popover DOM structure and keyboard interception logic (reused as-is)."

"Reused as-is" was treated as a statement about correctness, not just a statement about intent. The positioning code was never verified — the block node worked well enough that it was assumed to be right.

---

## Cross-cutting lessons

### 1. "Reuse as-is" is intent, not verification

Every place the plan said "reused as-is," it should have said "reused after verifying the following assumptions hold for inline nodes." The assumptions that needed checking:

- Does `NodeSelection` survive `setNodeMarkup` for inline atoms? (No — Bug 1)
- Does the click → focus-steal → delayed-sync sequence behave the same as for block atoms? (No — Bug 2)
- Is the existing popover positioning correct? (No — Bug 3)

### 2. ProseMirror treats block and inline atoms differently in several non-obvious ways

This should be a standing checklist item when adapting block-atom behavior to inline-atom context:

| Behavior | Block atom | Inline atom |
|---|---|---|
| `NodeSelection.map` after node replaced | Existence check — survives | Identity check — fails |
| Click/mousedown handling | Handled as block | `mightDrag` + `delayedSelectionSync` |
| Popover positioning | Large target, errors less visible | Small target, errors obvious |

### 3. "Trace the actual mechanism" applies to UI interaction, not just I/O

CLAUDE.md says to trace mechanisms for I/O features before designing. The same discipline applies to UI interaction flows. Clicking on an existing atom node is a distinct mechanism from inserting one via toolbar — and it was the harder case. It deserved its own trace in the plan.

### 4. Manual verification steps should cover the full lifecycle, not just the happy path

The plan's verification listed "insert → edit → escape." The full lifecycle for an editing feature also includes:

- Re-select by click (path 2 above)
- Undo/redo round-trips
- Select, navigate away, re-select

Explicitly listing these would have caught Bug 2 before shipping.

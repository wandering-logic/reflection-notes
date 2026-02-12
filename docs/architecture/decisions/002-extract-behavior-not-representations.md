# 2. Extract Behavior, Not Representations

Date: 2026-02-11

## Status

Accepted

## Context

During a testability refactoring effort (Phase 2.2), we needed to improve the image placeholder handling in the paste system. When pasting images from remote URLs, we insert a placeholder (`placeholder:loading-{id}`) while fetching, then update it to either the real path or `placeholder:failed`.

The original plan called for extracting a "PlaceholderState machine" - inspired by Beizer's insight that state machines are a primary source of bugs and should be made explicit and testable.

We initially created `placeholderState.ts` with:
- Type definitions for placeholder states (loading/resolved/failed)
- Serialization functions (`serializePlaceholder`)
- Parsing functions (`parsePlaceholder`)
- Predicate helpers (`isPlaceholder`, `isLoadingPlaceholder`, `isFailedPlaceholder`)
- 37 unit tests

This added ~400 lines of code and tests.

## Decision

We removed `placeholderState.ts` and instead extracted only `replaceImageSrc(view, oldSrc, newSrc)` - a function that finds an image node by its src attribute and updates it.

**The key insight:** Before extracting, identify what's actually wrong:

| Problem | Solution |
|---------|----------|
| Scattered/implicit state | Extract a state machine |
| Duplicated code | Extract a function |
| Complex data format | Extract a parser/serializer |

The placeholder handling had **duplicated code** (the same 20-line document traversal appeared twice), not scattered state. The "state" was just a string in a DOM attribute - already simple and explicit.

Applying a state machine pattern to something that's already a simple string is over-engineering. `serializePlaceholder({ status: "failed" })` is worse than `"placeholder:failed"` - more verbose, harder to read, and the tests were validating trivial string manipulation.

Compare to Phase 2.1 (AppState) where a state machine was appropriate:
- 3 separate nullable variables that had to stay in sync
- Implicit states spread across the codebase
- Possible invalid state combinations

## Consequences

**Positive:**
- Removed 400 lines of unnecessary abstraction
- `replaceImageSrc()` eliminated actual code duplication (~40 lines → ~4 lines at each call site)
- Code is more direct and readable
- Tests focus on valuable behavior, not string encoding

**Negative:**
- If the placeholder format ever changes, it's not centralized (but it's simple enough that this is fine)
- Lost the type-level documentation of placeholder states (but the strings are self-documenting)

**Lesson learned:**
Don't apply a pattern just because it sounds sophisticated. Identify the actual problem first, then choose the minimal solution that addresses it.

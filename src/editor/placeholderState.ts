/**
 * Explicit state machine for image placeholder lifecycle.
 *
 * When pasting images from remote URLs, we can't block the paste operation
 * while fetching. Instead, we insert a placeholder and update it async:
 *
 * 1. loading: Image fetch in progress, shows spinner
 * 2. resolved: Fetch succeeded, replaced with actual file path
 * 3. failed: Fetch failed, shows error state
 *
 * The state is serialized into the image src attribute as a string.
 */

/**
 * Placeholder state as a discriminated union.
 */
export type PlaceholderState =
  | { status: "loading"; id: string }
  | { status: "resolved"; path: string }
  | { status: "failed" };

/**
 * Events that can trigger state transitions.
 */
export type PlaceholderEvent =
  | { type: "fetch_success"; path: string }
  | { type: "fetch_failure" };

/**
 * Generate a unique placeholder ID.
 */
export function generatePlaceholderId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Create a new loading placeholder state.
 */
export function createLoadingPlaceholder(id?: string): PlaceholderState {
  return { status: "loading", id: id ?? generatePlaceholderId() };
}

/**
 * Serialize a placeholder state to a src string.
 *
 * - loading: "placeholder:loading-{id}"
 * - resolved: "{path}" (just the path, no prefix)
 * - failed: "placeholder:failed"
 */
export function serializePlaceholder(state: PlaceholderState): string {
  switch (state.status) {
    case "loading":
      return `placeholder:loading-${state.id}`;
    case "resolved":
      return state.path;
    case "failed":
      return "placeholder:failed";
  }
}

/**
 * Parse a src string into a placeholder state.
 * Returns null if the src is not a placeholder (i.e., it's a real path or URL).
 */
export function parsePlaceholder(src: string): PlaceholderState | null {
  if (src === "placeholder:failed") {
    return { status: "failed" };
  }

  if (src.startsWith("placeholder:loading-")) {
    const id = src.slice("placeholder:loading-".length);
    return { status: "loading", id };
  }

  // Not a placeholder - could be a resolved path, data URL, remote URL, etc.
  return null;
}

/**
 * Check if a src string represents a placeholder (loading or failed).
 */
export function isPlaceholder(src: string): boolean {
  return src.startsWith("placeholder:");
}

/**
 * Check if a src string represents a loading placeholder.
 */
export function isLoadingPlaceholder(src: string): boolean {
  return src.startsWith("placeholder:loading");
}

/**
 * Check if a src string represents a failed placeholder.
 */
export function isFailedPlaceholder(src: string): boolean {
  return src === "placeholder:failed";
}

/**
 * Pure state transition function.
 * Returns the new state after applying an event.
 *
 * Valid transitions:
 * - loading + fetch_success -> resolved
 * - loading + fetch_failure -> failed
 * - failed/resolved + any event -> null (invalid, already terminal)
 */
export function transitionPlaceholder(
  state: PlaceholderState,
  event: PlaceholderEvent,
): PlaceholderState | null {
  // Only loading state can transition
  if (state.status !== "loading") {
    return null;
  }

  switch (event.type) {
    case "fetch_success":
      return { status: "resolved", path: event.path };
    case "fetch_failure":
      return { status: "failed" };
  }
}

/**
 * Get the src string that should replace a placeholder after an event.
 * Convenience function that combines transition + serialize.
 */
export function resolvePlaceholder(
  currentSrc: string,
  event: PlaceholderEvent,
): string | null {
  const state = parsePlaceholder(currentSrc);
  if (!state) return null;

  const newState = transitionPlaceholder(state, event);
  if (!newState) return null;

  return serializePlaceholder(newState);
}

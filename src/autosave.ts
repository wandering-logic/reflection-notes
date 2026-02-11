/**
 * AutosaveManager - explicit state machine for autosave lifecycle
 *
 * State machine:
 *   IDLE ──[schedule()]──→ COUNTING
 *   COUNTING ──[schedule()]──→ COUNTING (reset timer)
 *   COUNTING ──[timer fires]──→ SAVING
 *   COUNTING ──[cancel()]──→ IDLE
 *   SAVING ──[schedule()]──→ SAVING_PENDING
 *   SAVING ──[complete]──→ IDLE
 *   SAVING_PENDING ──[schedule()]──→ SAVING_PENDING (no-op)
 *   SAVING_PENDING ──[complete]──→ COUNTING (restart timer)
 *
 * This properly handles edits that occur during a save operation.
 */

export type AutosaveState = "idle" | "counting" | "saving" | "saving_pending";

export interface AutosaveConfig {
  /** Debounce delay in milliseconds */
  delayMs: number;

  /** Async function to perform the save */
  save: () => Promise<void>;

  /** Optional callback after each successful save */
  onAfterSave?: () => void;

  /** Injectable timer functions for testing */
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export class AutosaveManager {
  private _state: AutosaveState = "idle";
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<void> | null = null;

  private readonly delay: number;
  private readonly save: () => Promise<void>;
  private readonly onAfterSave?: () => void;
  private readonly _setTimeout: typeof globalThis.setTimeout;
  private readonly _clearTimeout: typeof globalThis.clearTimeout;

  constructor(config: AutosaveConfig) {
    this.delay = config.delayMs;
    this.save = config.save;
    this.onAfterSave = config.onAfterSave;
    // Bind to globalThis to avoid "Illegal invocation" when called as methods
    this._setTimeout =
      config.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this._clearTimeout =
      config.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  }

  /** Current state (exposed for testing/debugging) */
  get state(): AutosaveState {
    return this._state;
  }

  /** True if there's a pending or in-progress save */
  get isPending(): boolean {
    return this._state !== "idle";
  }

  /**
   * Schedule a save after the debounce delay.
   * If already counting, resets the timer.
   * If currently saving, marks that another save is needed after.
   */
  schedule(): void {
    switch (this._state) {
      case "idle":
        this.startTimer();
        this._state = "counting";
        break;
      case "counting":
        // Reset the debounce timer
        this.clearTimer();
        this.startTimer();
        break;
      case "saving":
        // Mark that we need another save after this one completes
        this._state = "saving_pending";
        break;
      case "saving_pending":
        // Already marked, nothing to do
        break;
    }
  }

  /**
   * Cancel any pending save.
   * If currently saving, cancels the pending re-save but lets current save complete.
   */
  cancel(): void {
    switch (this._state) {
      case "idle":
        break;
      case "counting":
        this.clearTimer();
        this._state = "idle";
        break;
      case "saving":
        // Can't cancel mid-save, it continues
        break;
      case "saving_pending":
        // Cancel the pending re-save, but current save continues
        this._state = "saving";
        break;
    }
  }

  /**
   * Ensure all pending changes are saved before returning.
   * Use this before switching notes.
   */
  async flush(): Promise<void> {
    switch (this._state) {
      case "idle":
        return;

      case "counting":
        // Cancel timer and save immediately
        this.clearTimer();
        await this.doSave();
        return;

      case "saving":
      case "saving_pending":
        // Wait for current save to complete
        if (this.savePromise) {
          await this.savePromise;
        }
        // After await, state may have changed: saving_pending -> counting via doSave's finally.
        // TypeScript doesn't track state changes across await, so we need to re-check.
        if ((this._state as AutosaveState) === "counting") {
          await this.flush();
        }
        return;
    }
  }

  private startTimer(): void {
    this.timeoutId = this._setTimeout(() => {
      this.timeoutId = null;
      // Errors are handled in doSave's finally block (state transitions correctly).
      // We catch here to prevent unhandled rejection warnings.
      this.doSave().catch(() => {});
    }, this.delay);
  }

  private clearTimer(): void {
    if (this.timeoutId !== null) {
      this._clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private async doSave(): Promise<void> {
    this._state = "saving";
    this.savePromise = this.save();

    try {
      await this.savePromise;
      this.onAfterSave?.();
    } finally {
      this.savePromise = null;

      // After await, schedule() may have changed state from "saving" to "saving_pending".
      // TypeScript doesn't track state changes across await, so we cast.
      if ((this._state as AutosaveState) === "saving_pending") {
        // Edits came in during save, restart the timer
        this.startTimer();
        this._state = "counting";
      } else {
        this._state = "idle";
      }
    }
  }
}

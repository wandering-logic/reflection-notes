import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveManager } from "./autosave";

describe("AutosaveManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("state transitions", () => {
    it("starts in idle state", () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      expect(manager.state).toBe("idle");
      expect(manager.isPending).toBe(false);
    });

    it("idle -> counting on schedule()", () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();

      expect(manager.state).toBe("counting");
      expect(manager.isPending).toBe(true);
    });

    it("counting -> counting on schedule() (resets timer)", () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      vi.advanceTimersByTime(800);
      manager.schedule(); // reset timer
      vi.advanceTimersByTime(800);

      // Should not have saved yet (timer was reset)
      expect(save).not.toHaveBeenCalled();
      expect(manager.state).toBe("counting");
    });

    it("counting -> saving when timer fires", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      vi.advanceTimersByTime(1000);

      // Save should be called, state should be saving (briefly) then idle
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("counting -> idle on cancel()", () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      manager.cancel();

      expect(manager.state).toBe("idle");
      expect(manager.isPending).toBe(false);

      // Advance time - save should not fire
      vi.advanceTimersByTime(2000);
      expect(save).not.toHaveBeenCalled();
    });

    it("saving -> saving_pending on schedule()", async () => {
      let resolveSave: () => void;
      const savePromise = new Promise<void>((resolve) => {
        resolveSave = resolve;
      });
      const save = vi.fn().mockReturnValue(savePromise);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      vi.advanceTimersByTime(1000);

      // Now in saving state
      expect(manager.state).toBe("saving");

      // Edit during save
      manager.schedule();
      expect(manager.state).toBe("saving_pending");

      // Complete the save
      resolveSave!();
      await Promise.resolve(); // Let the promise resolve

      // Should transition to counting (not idle)
      expect(manager.state).toBe("counting");
    });

    it("saving -> idle on complete", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      vi.advanceTimersByTime(1000);
      await Promise.resolve(); // Let save complete

      expect(manager.state).toBe("idle");
      expect(manager.isPending).toBe(false);
    });

    it("saving_pending -> counting on complete (restarts timer)", async () => {
      let resolveSave: () => void;
      const save = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const manager = new AutosaveManager({ delayMs: 1000, save });

      // Start first save
      manager.schedule();
      vi.advanceTimersByTime(1000);
      expect(manager.state).toBe("saving");

      // Edit during save
      manager.schedule();
      expect(manager.state).toBe("saving_pending");

      // Complete save
      resolveSave!();
      await Promise.resolve();

      // Should restart timer
      expect(manager.state).toBe("counting");
      expect(save).toHaveBeenCalledTimes(1);

      // Wait for second save
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(save).toHaveBeenCalledTimes(2);
    });

    it("saving_pending -> saving_pending on schedule() (no-op)", async () => {
      let resolveSave: () => void;
      const savePromise = new Promise<void>((resolve) => {
        resolveSave = resolve;
      });
      const save = vi.fn().mockReturnValue(savePromise);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      vi.advanceTimersByTime(1000);
      manager.schedule(); // -> saving_pending
      manager.schedule(); // should be no-op
      manager.schedule(); // should be no-op

      expect(manager.state).toBe("saving_pending");

      resolveSave!();
      await Promise.resolve();

      // Should only restart timer once
      expect(manager.state).toBe("counting");
    });
  });

  describe("cancel()", () => {
    it("no-op when idle", () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.cancel();
      expect(manager.state).toBe("idle");
    });

    it("cancels pending re-save but lets current save complete", async () => {
      let resolveSave: () => void;
      const save = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      vi.advanceTimersByTime(1000);
      manager.schedule(); // -> saving_pending
      manager.cancel(); // cancel pending, but save continues

      expect(manager.state).toBe("saving");

      resolveSave!();
      await Promise.resolve();

      // Should go to idle (not counting, because we cancelled pending)
      expect(manager.state).toBe("idle");
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  describe("flush()", () => {
    it("no-op when idle", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      await manager.flush();

      expect(save).not.toHaveBeenCalled();
      expect(manager.state).toBe("idle");
    });

    it("saves immediately when counting", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      expect(manager.state).toBe("counting");

      await manager.flush();

      expect(save).toHaveBeenCalledTimes(1);
      expect(manager.state).toBe("idle");
    });

    it("waits for current save when saving", async () => {
      let resolveSave: () => void;
      const save = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      vi.advanceTimersByTime(1000);
      expect(manager.state).toBe("saving");

      const flushPromise = manager.flush();

      // Flush should be waiting
      let flushed = false;
      flushPromise.then(() => {
        flushed = true;
      });
      await Promise.resolve();
      expect(flushed).toBe(false);

      // Complete the save
      resolveSave!();
      await flushPromise;

      expect(flushed).toBe(true);
      expect(manager.state).toBe("idle");
    });

    it("handles saving_pending by waiting for both saves", async () => {
      let resolveSave: () => void;
      let saveCount = 0;
      const save = vi.fn().mockImplementation(() => {
        saveCount++;
        return new Promise<void>((resolve) => {
          resolveSave = resolve;
        });
      });
      const manager = new AutosaveManager({ delayMs: 1000, save });

      // Start first save
      manager.schedule();
      vi.advanceTimersByTime(1000);
      expect(manager.state).toBe("saving");

      // Edit during save
      manager.schedule();
      expect(manager.state).toBe("saving_pending");

      // Start flush (should wait for both saves)
      const flushPromise = manager.flush();

      // Complete first save - need to let all microtasks settle
      resolveSave!();
      await vi.advanceTimersByTimeAsync(0);

      // Now flush() should have started the second save
      expect(saveCount).toBe(2);
      expect(manager.state).toBe("saving");

      // Complete second save
      resolveSave!();
      await flushPromise;

      expect(manager.state).toBe("idle");
      expect(save).toHaveBeenCalledTimes(2);
    });
  });

  describe("onAfterSave callback", () => {
    it("calls onAfterSave after successful save", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const onAfterSave = vi.fn();
      const manager = new AutosaveManager({ delayMs: 1000, save, onAfterSave });

      manager.schedule();
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(onAfterSave).toHaveBeenCalledTimes(1);
    });

    it("calls onAfterSave after each save in saving_pending scenario", async () => {
      let resolveSave: () => void;
      const save = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const onAfterSave = vi.fn();
      const manager = new AutosaveManager({ delayMs: 1000, save, onAfterSave });

      manager.schedule();
      vi.advanceTimersByTime(1000);
      manager.schedule(); // -> saving_pending

      resolveSave!();
      await Promise.resolve();
      expect(onAfterSave).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      resolveSave!();
      await Promise.resolve();
      expect(onAfterSave).toHaveBeenCalledTimes(2);
    });

    it("does not call onAfterSave when save throws", async () => {
      const save = vi.fn().mockRejectedValue(new Error("save failed"));
      const onAfterSave = vi.fn();
      const manager = new AutosaveManager({ delayMs: 1000, save, onAfterSave });

      manager.schedule();

      // Use advanceTimersByTimeAsync to properly handle the async rejection
      await vi.advanceTimersByTimeAsync(1000);

      // onAfterSave should NOT be called on error (it's in try block, not finally)
      expect(onAfterSave).not.toHaveBeenCalled();
      expect(manager.state).toBe("idle");
    });
  });

  describe("error handling", () => {
    it("transitions to idle on save error", async () => {
      const save = vi.fn().mockRejectedValue(new Error("save failed"));
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      await vi.advanceTimersByTimeAsync(1000);

      expect(manager.state).toBe("idle");
    });

    it("transitions to counting on save error when saving_pending", async () => {
      let rejectSave: (e: Error) => void;
      const save = vi.fn().mockImplementation(
        () =>
          new Promise<void>((_, reject) => {
            rejectSave = reject;
          }),
      );
      const manager = new AutosaveManager({ delayMs: 1000, save });

      manager.schedule();
      vi.advanceTimersByTime(1000);
      manager.schedule(); // -> saving_pending

      rejectSave!(new Error("save failed"));
      await vi.advanceTimersByTimeAsync(0);

      // Should still respect saving_pending and restart timer
      expect(manager.state).toBe("counting");
    });
  });
});

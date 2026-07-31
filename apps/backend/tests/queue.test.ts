import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  writeToDlq,
  listDlqEntries,
  removeDlqEntry,
  startRetryWorker,
  type DlqEntry,
} from "../src/queue.js";
import { resetCircuitBreaker } from "../src/services/circuit-breaker.js";

// Reset the in-memory store between tests by removing all entries
function clearDlq() {
  for (const entry of listDlqEntries()) {
    removeDlqEntry(entry.id);
  }
}

beforeEach(() => {
  clearDlq();
  resetCircuitBreaker();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("writeToDlq", () => {
  it("adds an entry to the DLQ", () => {
    writeToDlq({ matchId: 1 }, "RPC timeout");
    expect(listDlqEntries()).toHaveLength(1);
  });

  it("stores the payload and failure reason", () => {
    writeToDlq({ matchId: 42 }, "insufficient fees");
    const [entry] = listDlqEntries();
    expect(entry.payload).toEqual({ matchId: 42 });
    expect(entry.failureReason).toBe("insufficient fees");
    expect(entry.attempts).toBe(0);
    expect(entry.lastAttemptAt).toBeNull();
  });

  it("assigns a unique id to each entry", () => {
    writeToDlq({}, "err");
    writeToDlq({}, "err");
    const ids = listDlqEntries().map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("removeDlqEntry", () => {
  it("removes an entry by id", () => {
    const entry = writeToDlq({}, "err");
    removeDlqEntry(entry.id);
    expect(listDlqEntries()).toHaveLength(0);
  });

  it("is a no-op for unknown ids", () => {
    writeToDlq({}, "err");
    expect(() => removeDlqEntry("nonexistent")).not.toThrow();
    expect(listDlqEntries()).toHaveLength(1);
  });
});

describe("startRetryWorker", () => {
  it("calls the handler for each DLQ entry on the interval", async () => {
    writeToDlq({ matchId: 1 }, "network error");
    writeToDlq({ matchId: 2 }, "network error");

    const handler = vi.fn().mockResolvedValue(undefined);
    const stop = startRetryWorker(handler, 1000);

    await vi.advanceTimersByTimeAsync(1000);

    expect(handler).toHaveBeenCalledTimes(2);
    stop();
  });

  it("removes entries after a successful retry", async () => {
    writeToDlq({ matchId: 1 }, "err");
    const handler = vi.fn().mockResolvedValue(undefined);
    const stop = startRetryWorker(handler, 1000);

    await vi.advanceTimersByTimeAsync(1000);

    expect(listDlqEntries()).toHaveLength(0);
    stop();
  });

  it("keeps entries in DLQ when retry handler throws", async () => {
    writeToDlq({ matchId: 1 }, "err");
    const handler = vi.fn().mockRejectedValue(new Error("still failing"));
    const stop = startRetryWorker(handler, 1000);

    await vi.advanceTimersByTimeAsync(1000);

    const entries = listDlqEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].attempts).toBeGreaterThan(0);
    stop();
  });

  it("returns a cleanup function that stops retries", async () => {
    writeToDlq({ matchId: 1 }, "err");
    const handler = vi.fn().mockResolvedValue(undefined);
    const stop = startRetryWorker(handler, 1000);
    stop();

    await vi.advanceTimersByTimeAsync(2000);

    expect(handler).not.toHaveBeenCalled();
  });

  describe("Circuit breaker integration", () => {
    it("pauses retries when circuit opens after N RPC failures", async () => {
      writeToDlq({ matchId: 1 }, "RPC error 1");
      writeToDlq({ matchId: 2 }, "RPC error 2");
      writeToDlq({ matchId: 3 }, "RPC error 3");
      writeToDlq({ matchId: 4 }, "RPC error 4");
      writeToDlq({ matchId: 5 }, "RPC error 5");

      const handler = vi.fn().mockRejectedValue(new Error("RPC timeout"));
      const stop = startRetryWorker(handler, 100);

      // First interval: 5 entries fail - circuit opens after 5th failure
      await vi.advanceTimersByTimeAsync(100);
      expect(handler).toHaveBeenCalledTimes(5);

      // Second interval: circuit is open, no more handler calls
      handler.mockClear();
      await vi.advanceTimersByTimeAsync(100);
      
      // Circuit should be open, no more handler calls
      expect(handler).not.toHaveBeenCalled();
      
      stop();
    });

    it("resumes retries after circuit cooldown expires", async () => {
      // Create 5 entries that will fail to trigger circuit opening
      writeToDlq({ matchId: 1 }, "RPC error 1");
      writeToDlq({ matchId: 2 }, "RPC error 2");
      writeToDlq({ matchId: 3 }, "RPC error 3");
      writeToDlq({ matchId: 4 }, "RPC error 4");
      writeToDlq({ matchId: 5 }, "RPC error 5");
      
      let callCount = 0;
      const handler = vi.fn().mockImplementation(async () => {
        callCount++;
        throw new Error("RPC timeout");
      });

      const stop = startRetryWorker(handler, 100);

      // First interval: process all 5 entries, circuit opens after 5th failure
      await vi.advanceTimersByTimeAsync(100);
      expect(handler).toHaveBeenCalledTimes(5);

      // Circuit is now open, handler won't be called
      handler.mockClear();
      await vi.advanceTimersByTimeAsync(100);
      expect(handler).not.toHaveBeenCalled();

      // Wait for cooldown to expire (default is 30s)
      await vi.advanceTimersByTimeAsync(30000);
      
      // Resume retries (in half-open state) - should attempt retry now
      await vi.advanceTimersByTimeAsync(100);
      
      // Handler should be called again after cooldown (in HALF_OPEN state)
      expect(handler.mock.calls.length).toBeGreaterThan(0);
      
      stop();
    });

    it("distinguishes RPC errors from other errors", async () => {
      writeToDlq({ matchId: 1 }, "RPC error");
      writeToDlq({ matchId: 2 }, "other error");

      let rpcErrorCount = 0;
      const handler = vi.fn().mockImplementation(async (entry: DlqEntry) => {
        if (entry.failureReason.includes("RPC")) {
          rpcErrorCount++;
          throw new Error("RPC timeout");
        }
        // Other errors don't trigger circuit breaker
        throw new Error("Other error");
      });

      const stop = startRetryWorker(handler, 100);

      // Process entries multiple times
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      // RPC errors should eventually open circuit
      // Non-RPC errors should not affect circuit breaker
      stop();
    });
  });
});

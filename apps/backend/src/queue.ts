/**
 * Dead-letter queue (DLQ) for failed oracle submissions.
 *
 * Failed submissions are stored in memory (file-based persistence can be added
 * by swapping the store). A retry worker periodically attempts to reprocess
 * each entry and emits `oracle_dlq_depth` for monitoring.
 *
 * Circuit breaker pattern protects against cascading RPC failures:
 * - After N consecutive failures, job processing is paused
 * - Backoff cooldown prevents hammering a degraded endpoint
 * - Automatic recovery testing after cooldown expires
 */
export async function initializeQueue(): Promise<void> {
  const storeType = process.env.QUEUE_STORE || 'auto';

import { getCircuitBreaker, CircuitState } from './services/circuit-breaker.js';

// Simple console-based logger (replaces dependency on external logger)
const logger = {
  info: (msg: string | object, context?: string) => console.log(`[INFO] ${context || 'queue'}:`, msg),
  warn: (msg: string | object, context?: string) => console.warn(`[WARN] ${context || 'queue'}:`, msg),
  error: (msg: string | object, context?: string) => console.error(`[ERROR] ${context || 'queue'}:`, msg),
};

  await queueStore.initialize();
  logger.info('Queue store initialized');
}

/**
 * Get the current queue store instance.
 * Must call initializeQueue() first.
 */
function getQueueStore(): PersistentQueueStore {
  if (!queueStore) {
    throw new Error('Queue store not initialized. Call initializeQueue() first.');
  }
  return queueStore;
}

/** Write a failed submission to the DLQ. */
export async function writeToDlq(
  payload: unknown,
  failureReason: string
): Promise<DlqEntry> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: DlqEntry = {
    id,
    payload,
    failureReason,
    attempts: 0,
    createdAt: Date.now(),
    lastAttemptAt: null,
  };

  await getQueueStore().add(entry);
  logger.warn({ dlqId: id, failureReason }, 'oracle_dlq: entry written');
  await emitDlqDepth();
  return entry;
}

/** Return all pending DLQ entries (shallow copy). */
export async function listDlqEntries(): Promise<DlqEntry[]> {
  return await getQueueStore().getAll();
}

/** Remove a successfully processed entry. */
export async function removeDlqEntry(id: string): Promise<void> {
  await getQueueStore().remove(id);
  await emitDlqDepth();
}

/** Update an entry's retry state. */
export async function updateDlqEntry(
  id: string,
  updates: Partial<DlqEntry>
): Promise<void> {
  await getQueueStore().update(id, updates);
}

/** Emit the oracle_dlq_depth metric. */
async function emitDlqDepth(): Promise<void> {
  const depth = await getQueueStore().count();
  logger.info({ metric: 'oracle_dlq_depth', value: depth }, 'oracle_dlq_depth');
}

export type RetryHandler = (entry: DlqEntry) => Promise<void>;

/**
 * Retry worker — call once on startup.
 * Returns a cleanup function that clears the interval.
 * 
 * Implements circuit breaker to prevent cascading failures:
 * - Circuit opens after N consecutive RPC failures
 * - Job processing pauses during cooldown
 * - Exponential backoff for recovery attempts
 */
export function startRetryWorker(
  handler: RetryHandler,
  intervalMs = 60_000
): () => void {
  const breaker = getCircuitBreaker();

  // Monitor circuit state changes
  const originalOnStateChange = breaker['config'].onStateChange;
  breaker['config'].onStateChange = (from: CircuitState, to: CircuitState) => {
    if (from !== to) {
      logger.warn(
        { from, to, ...breaker.getStatus() },
        'circuit_breaker: state changed'
      );
    }
    originalOnStateChange?.(from, to);
  };

  const timer = setInterval(async () => {
    const entries = listDlqEntries();
    if (entries.length === 0) return;

    // Check if circuit allows processing
    if (!breaker.allowRequest()) {
      const remaining = breaker.getRemainingCooldown();
      logger.warn(
        { remaining, state: breaker.getState(), count: entries.length },
        'circuit_breaker: job processing paused'
      );
      return;
    }

    logger.info(
      { count: entries.length, state: breaker.getState() },
      "oracle_dlq: retry worker running"
    );

    let failureInThisCycle = false;

    for (const entry of entries) {
      entry.attempts += 1;
      entry.lastAttemptAt = Date.now();
      try {
        await handler(entry);
        removeDlqEntry(entry.id);
        breaker.recordSuccess();
        logger.info({ dlqId: entry.id }, "oracle_dlq: entry resolved");
      } catch (err) {
        failureInThisCycle = true;
        const isRpcError = String(err).includes('RPC') || String(err).includes('Network');
        
        if (isRpcError) {
          const circuitOpened = breaker.recordFailure();
          if (circuitOpened) {
            logger.error(
              {
                dlqId: entry.id,
                attempt: entry.attempts,
                failureCount: breaker.getFailureCount(),
                cooldown: breaker.getRemainingCooldown(),
              },
              'circuit_breaker: RPC circuit opened, pausing job processing'
            );
            // Don't continue processing on circuit open
            break;
          }
        }

        logger.warn(
          {
            dlqId: entry.id,
            attempt: entry.attempts,
            isRpcError,
            err: String(err).substring(0, 100),
          },
          "oracle_dlq: retry failed"
        );
      }

      await emitDlqDepth();
    } catch (err) {
      logger.error({ err }, 'oracle_dlq: retry worker error');
    }
  }, intervalMs);

  return () => {
    if (retryInterval) {
      clearInterval(retryInterval);
      retryInterval = null;
    }
  };
}

/**
 * Close the queue store on application shutdown.
 */
export async function closeQueue(): Promise<void> {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }

  if (queueStore) {
    await queueStore.close();
    queueStore = null;
  }
}

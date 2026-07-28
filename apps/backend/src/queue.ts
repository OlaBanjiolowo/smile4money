/**
 * Dead-letter queue (DLQ) for failed oracle submissions.
 *
 * Failed submissions are persisted durably using a PersistentQueueStore.
 * A retry worker periodically attempts to reprocess each entry and emits
 * `oracle_dlq_depth` for monitoring.
 *
 * Store selection:
 * - QUEUE_STORE=mongodb (default if MONGODB_URL is set) → MongoDBQueueStore
 * - QUEUE_STORE=sqlite (default if MONGODB_URL is not set) → SQLiteQueueStore
 * - QUEUE_STORE=memory (development only) → InMemoryQueueStore
 */

import logger from './logger.js';
import type { DlqEntry, PersistentQueueStore } from './store/persistent-queue-store.js';
import { InMemoryQueueStore } from './store/in-memory-queue-store.js';
import { MongoDBQueueStore } from './store/mongodb-queue-store.js';
import { SQLiteQueueStore } from './store/sqlite-queue-store.js';

export type { DlqEntry };

let queueStore: PersistentQueueStore | null = null;
let retryInterval: NodeJS.Timeout | null = null;

/**
 * Initialize the queue store on application startup.
 * Must be called once before using the queue.
 */
export async function initializeQueue(): Promise<void> {
  const storeType = process.env.QUEUE_STORE || 'auto';

  // Auto-select store based on environment
  if (storeType === 'auto') {
    if (process.env.MONGODB_URL) {
      queueStore = new MongoDBQueueStore();
      logger.info('Initializing MongoDB queue store');
    } else {
      queueStore = new SQLiteQueueStore();
      logger.info('Initializing SQLite queue store');
    }
  } else if (storeType === 'mongodb') {
    queueStore = new MongoDBQueueStore();
    logger.info('Initializing MongoDB queue store (explicit)');
  } else if (storeType === 'sqlite') {
    queueStore = new SQLiteQueueStore();
    logger.info('Initializing SQLite queue store (explicit)');
  } else if (storeType === 'memory') {
    queueStore = new InMemoryQueueStore();
    logger.warn('Using in-memory queue store. Data will be lost on restart!');
  } else {
    throw new Error(`Invalid QUEUE_STORE value: ${storeType}`);
  }

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
 */
export function startRetryWorker(
  handler: RetryHandler,
  intervalMs = 60_000
): () => void {
  retryInterval = setInterval(async () => {
    try {
      const entries = await listDlqEntries();
      if (entries.length === 0) return;

      logger.info({ count: entries.length }, 'oracle_dlq: retry worker running');

      for (const entry of entries) {
        entry.attempts += 1;
        entry.lastAttemptAt = Date.now();

        try {
          await handler(entry);
          await removeDlqEntry(entry.id);
          logger.info({ dlqId: entry.id }, 'oracle_dlq: entry resolved');
        } catch (err) {
          // Update entry with new attempt count before logging
          await updateDlqEntry(entry.id, {
            attempts: entry.attempts,
            lastAttemptAt: entry.lastAttemptAt,
          });

          logger.warn(
            { dlqId: entry.id, attempt: entry.attempts, err },
            'oracle_dlq: retry failed'
          );
        }
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

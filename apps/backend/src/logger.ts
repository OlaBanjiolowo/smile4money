/**
 * Structured JSON logger for smile4money backend using pino.
 *
 * Emits logs in JSON format with standard fields for production log aggregation:
 * - timestamp (ISO 8601)
 * - level (info, warn, error)
 * - message (human-readable event description)
 * - service (smile4money-backend)
 * - context fields (match_id, tx_hash, dlqId, etc.)
 *
 * Compatible with log aggregation platforms: Datadog, CloudWatch, Loki, Splunk
 */

import pino from 'pino';

export interface LogContext {
  [key: string]: unknown;
}

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Create the pino logger instance with appropriate configuration for production.
 *
 * Configuration:
 * - `name`: Service identifier for aggregation systems
 * - `level`: Default log level (respects LOG_LEVEL env var)
 * - `transport`: Pretty-printing in development, JSON in production
 * - `base`: Standard fields included in every log
 * - `timestamp`: ISO 8601 format for consistency
 */
function createLogger() {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'info' : 'info');

  const baseConfig = {
    level: logLevel,
    base: {
      service: 'smile4money-backend',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (isDevelopment) {
    // Pretty print in development for readability
    return pino(
      {
        ...baseConfig,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: true,
          },
        },
      },
    );
  }

  // JSON output in production for log aggregation
  return pino(baseConfig);
}

const logger = createLogger();

/**
 * Log an info-level message with optional context.
 * Used for normal operational events (successful submissions, metrics).
 */
function info(context: LogContext, message: string): void {
  logger.info(context, message);
}

/**
 * Log a warn-level message with optional context.
 * Used for potentially problematic events (DLQ writes, retries, validation warnings).
 */
function warn(context: LogContext, message: string): void {
  logger.warn(context, message);
}

/**
 * Log an error-level message with optional context.
 * Used for exceptional conditions (submission failures, invalid requests).
 */
function error(context: LogContext, message: string): void {
  logger.error(context, message);
}

export default {
  info,
  warn,
  error,
};

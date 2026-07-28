/**
 * Simple structured logger for smile4money backend.
 * Can be replaced with a proper logging library (pino, winston, etc.)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}

function log(level: LogLevel, data: unknown, message: string): void {
  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...(typeof data === 'object' && data !== null ? { data } : {}),
  };

  const json = JSON.stringify(entry);

  if (level === 'error' || level === 'warn') {
    console.error(json);
  } else {
    console.log(json);
  }
}

export default {
  debug: (data: unknown, message: string) => log('debug', data, message),
  info: (data: unknown, message: string) => log('info', data, message),
  warn: (data: unknown, message: string) => log('warn', data, message),
  error: (data: unknown, message: string) => log('error', data, message),
};

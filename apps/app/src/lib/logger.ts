/**
 * Logger service for consistent logging across the application.
 * Can be extended to send logs to external services (Sentry, LogRocket, etc.)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  context?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LoggerErrorPayload {
  message: string;
  error?: unknown;
  options?: LoggerOptions;
}

type ErrorReporter = (payload: LoggerErrorPayload) => void;

class Logger {
  private isDev = process.env.NODE_ENV === 'development';
  private errorReporter?: ErrorReporter;

  private formatMessage(level: LogLevel, message: string, options?: LoggerOptions): string {
    const timestamp = new Date().toISOString();
    const context = options?.context ? `[${options.context}]` : '';
    return `${timestamp} ${level.toUpperCase()} ${context} ${message}`;
  }

  setErrorReporter(reporter?: ErrorReporter): void {
    this.errorReporter = reporter;
  }

  debug(message: string, options?: LoggerOptions): void {
    if (this.isDev) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('debug', message, options), options?.metadata);
    }
  }

  info(message: string, options?: LoggerOptions): void {
    if (this.isDev) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('info', message, options), options?.metadata);
    }
  }

  warn(message: string, options?: LoggerOptions): void {
    // eslint-disable-next-line no-console
    console.warn(this.formatMessage('warn', message, options), options?.metadata);
  }

  error(message: string, error?: unknown, options?: LoggerOptions): void {
    const formattedError =
      error instanceof Error ? { message: error.message, stack: error.stack } : error;

    // eslint-disable-next-line no-console
    console.error(this.formatMessage('error', message, options), {
      error: formattedError,
      ...options?.metadata,
    });

    this.errorReporter?.({
      error,
      message,
      options,
    });
  }
}

export const logger = new Logger();

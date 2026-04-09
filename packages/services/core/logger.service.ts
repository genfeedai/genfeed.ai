import * as Sentry from '@sentry/nextjs';
import pino, { type Logger as PinoLogger } from 'pino';

interface LogContext {
  error?: Error | unknown;
  reportToSentry?: boolean;
  tags?: Record<string, string>;
  [key: string]: unknown;
}

const pinoLogger: PinoLogger = pino({
  level: 'info',
  name: 'genfeed.ai',
});

function logToConsole(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  obj?: unknown,
): void {
  if (obj !== undefined) {
    console[level](message, obj);
  } else {
    console[level](message);
  }
}

/**
 * Helper to safely capture errors in Sentry
 * Extracts the actual Error object and context from the log object
 */
const captureSentryError = (message: string, obj?: unknown) => {
  try {
    const logContext = obj as LogContext | undefined;
    if (logContext?.reportToSentry === false) {
      return;
    }

    const errorObj = logContext?.error || obj;
    if (
      errorObj instanceof Error &&
      ((errorObj as Error & Record<string, unknown>).isAuthError === true ||
        (errorObj as Error & Record<string, unknown>).isCancelled === true ||
        (errorObj as Error & Record<string, unknown>).isNetworkError === true ||
        (errorObj as Error & Record<string, unknown>).isTimeout === true)
    ) {
      return;
    }

    if (!(errorObj instanceof Error)) {
      return;
    }

    const actualError = errorObj;
    const context: Sentry.CaptureContext = {
      extra: {
        message,
        ...(obj && typeof obj === 'object'
          ? (obj as Record<string, unknown>)
          : {}),
      },
      level: 'error',
    };

    if (logContext?.tags) {
      context.tags = logContext.tags;
    }

    Sentry.captureException(actualError, context);
  } catch (sentryError) {
    if (typeof window !== 'undefined') {
      logToConsole('debug', 'Failed to send error to Sentry', { sentryError });
    } else {
      pinoLogger.debug({ sentryError }, 'Failed to send error to Sentry');
    }
  }
};

/**
 * Helper to safely capture messages in Sentry
 */
const captureSentryMessage = (
  message: string,
  level: 'warning' | 'info',
  obj?: unknown,
) => {
  try {
    const logContext = obj as LogContext | undefined;
    if (logContext?.reportToSentry === false) {
      return;
    }

    Sentry.captureMessage(message, {
      extra:
        obj && typeof obj === 'object'
          ? (obj as Record<string, unknown>)
          : undefined,
      level,
      tags: logContext?.tags,
    });
  } catch (sentryError) {
    if (typeof window !== 'undefined') {
      logToConsole('debug', 'Failed to send message to Sentry', {
        sentryError,
      });
    } else {
      pinoLogger.debug({ sentryError }, 'Failed to send message to Sentry');
    }
  }
};

function logWithContext(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  obj?: unknown,
): void {
  if (typeof window !== 'undefined') {
    logToConsole(level, message, obj);
    return;
  }

  if (obj !== undefined) {
    pinoLogger[level](obj, message);
  } else {
    pinoLogger[level](message);
  }
}

export const logger = {
  debug: (message: string, obj?: unknown) =>
    logWithContext('debug', message, obj),

  error: (message: string, obj?: unknown) => {
    logWithContext('error', message, obj);
    captureSentryError(message, obj);
  },

  info: (message: string, obj?: unknown) =>
    logWithContext('info', message, obj),

  warn: (message: string, obj?: unknown) => {
    logWithContext('warn', message, obj);
    captureSentryMessage(message, 'warning', obj);
  },
};

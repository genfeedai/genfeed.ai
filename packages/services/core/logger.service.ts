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

function serializeForConsole(obj: unknown): unknown {
  if (obj == null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Error) {
    return { message: obj.message, stack: obj.stack, name: obj.name };
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] =
      value instanceof Error
        ? { message: value.message, stack: value.stack, name: value.name }
        : value;
  }
  return result;
}

function toErrorSummary(error: Error): string {
  const headline = `${error.name}: ${error.message}`;
  const stackFrame = error.stack
    ?.split('\n')
    .slice(1)
    .find((line) => line.trim().startsWith('at '));

  return stackFrame ? `${headline}\n${stackFrame.trim()}` : headline;
}

function extractError(obj: unknown): Error | null {
  if (obj instanceof Error) {
    return obj;
  }

  if (obj && typeof obj === 'object') {
    const error = (obj as LogContext).error;
    return error instanceof Error ? error : null;
  }

  return null;
}

function formatBrowserContext(obj: unknown): unknown {
  const serialized = serializeForConsole(obj);

  if (!serialized || typeof serialized !== 'object') {
    return serialized;
  }

  const { componentStack, error, ...context } = serialized as Record<
    string,
    unknown
  >;

  return {
    ...context,
    ...(typeof componentStack === 'string'
      ? {
          componentStack: componentStack
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 8),
        }
      : {}),
    ...(error ? { error } : {}),
  };
}

function logToConsole(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  obj?: unknown,
): void {
  const error = extractError(obj);
  if (error) {
    console[level](`${message}\n${toErrorSummary(error)}`);

    if (obj && obj !== error) {
      console.debug(`${message} context`, formatBrowserContext(obj));
    }
    return;
  }

  if (obj !== undefined) {
    console[level](message, formatBrowserContext(obj));
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

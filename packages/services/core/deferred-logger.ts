/**
 * Logging for code that ships on every page but rarely logs: error boundaries,
 * copy buttons, layout guards. The full logger carries pino and the Sentry
 * SDK, so importing it statically puts both in the first-load bundle of every
 * page that code appears on. This mirrors its API, loads it on the first call
 * and reuses it afterwards.
 */
type Logger = typeof import('./logger.service').logger;
type LogLevel = keyof Logger;

let loggerPromise: Promise<Logger> | null = null;

function loadLogger(): Promise<Logger> {
  loggerPromise ??= import('./logger.service').then(({ logger }) => logger);
  return loggerPromise;
}

function deferTo(level: LogLevel) {
  return (message: string, context?: unknown): void => {
    void loadLogger().then((logger) => logger[level](message, context));
  };
}

/** Same contract as `logger`, delivered once the logger has loaded. */
export const deferredLogger: Record<
  LogLevel,
  (message: string, context?: unknown) => void
> = {
  debug: deferTo('debug'),
  error: deferTo('error'),
  info: deferTo('info'),
  warn: deferTo('warn'),
};

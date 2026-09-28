/**
 * Error reporting for code that ships on every page but rarely fires: error
 * boundaries. The full logger carries pino and the Sentry SDK, so importing it
 * statically puts both in the first-load bundle of every page such a boundary
 * wraps. This loads it on the first error instead and reuses it afterwards.
 */
type Logger = typeof import('./logger.service').logger;

let loggerPromise: Promise<Logger> | null = null;

function loadLogger(): Promise<Logger> {
  loggerPromise ??= import('./logger.service').then(({ logger }) => logger);
  return loggerPromise;
}

/** Same contract as `logger.error`, delivered once the logger has loaded. */
export function logErrorDeferred(message: string, context?: unknown): void {
  void loadLogger().then((logger) => logger.error(message, context));
}

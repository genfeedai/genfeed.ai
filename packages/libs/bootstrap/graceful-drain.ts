import type { Server } from 'node:http';
import process from 'node:process';

/**
 * Closable Nest application surface used during SIGTERM/SIGINT drain.
 * Keep this structural so files (HTTP Nest app) and workers-style
 * application contexts can share the same helper.
 */
export interface DrainableApplication {
  close(): Promise<void>;
}

export interface DrainLogger {
  error(message: string, trace?: string | Error | unknown): void;
  warn(message: string): void;
}

export interface RegisterGracefulDrainOptions {
  app: DrainableApplication;
  httpServer: Pick<Server, 'close'>;
  logger: DrainLogger;
  serviceName: string;
}

export interface DrainHttpApplicationOptions
  extends RegisterGracefulDrainOptions {
  signal: string;
}

function isHttpServerAlreadyClosed(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_SERVER_NOT_RUNNING'
  );
}

function closeHttpServer(httpServer: Pick<Server, 'close'>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      httpServer.close((error) => {
        if (!error || isHttpServerAlreadyClosed(error)) {
          resolve();
          return;
        }

        reject(error);
      });
    } catch (error: unknown) {
      if (isHttpServerAlreadyClosed(error)) {
        resolve();
        return;
      }

      reject(error);
    }
  });
}

/**
 * Drain an HTTP Nest service the way workers already do:
 * SIGTERM/SIGINT → close HTTP → `app.close()` (BullMQ OnModuleDestroy) → exit.
 *
 * Do not use `setupGracefulShutdown()` here. That helper `process.exit(0)`s
 * immediately, so Nest and BullMQ never drain in-flight jobs.
 */
export async function drainHttpApplication(
  options: DrainHttpApplicationOptions,
): Promise<void> {
  const { app, httpServer, logger, serviceName, signal } = options;

  logger.warn(`Received ${signal}, shutting down ${serviceName} gracefully`);

  try {
    await closeHttpServer(httpServer);
    await app.close();
    process.exit(0);
  } catch (error: unknown) {
    logger.error(
      `Failed to shut down ${serviceName} gracefully`,
      error instanceof Error ? error : String(error),
    );
    process.exit(1);
  }
}

export function registerGracefulDrain(
  options: RegisterGracefulDrainOptions,
): void {
  const shutdown = (signal: string) => {
    void drainHttpApplication({ ...options, signal });
  };

  process.once('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  process.once('SIGINT', () => {
    shutdown('SIGINT');
  });
}

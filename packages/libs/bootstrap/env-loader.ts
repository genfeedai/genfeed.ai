import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as dotenv from 'dotenv';
import type { Request, Response } from 'express';

export interface BootstrapOptions {
  /** App name (e.g., 'api', 'files', 'mcp', 'notifications') */
  app:
    | 'api'
    | 'clips'
    | 'discord'
    | 'fanvue'
    | 'files'
    | 'images'
    | 'mcp'
    | 'notifications'
    | 'slack'
    | 'telegram'
    | 'twitch'
    | 'videos'
    | 'voices'
    | 'workers';
  /** Max event listeners (default: 50) */
  maxListeners?: number;
}

export interface ServiceShellOptions {
  redirectTarget?: string;
  redirectPaths?: string[];
  trustProxy?: number;
}

/**
 * Bootstrap environment for NestJS services.
 * Must be called at the very top of main.ts, before any imports that need env vars.
 *
 * CWD is apps/server/ (scripts do `cd ..` before running)
 * Loads env files in priority order (first loaded wins):
 * - Development/local: app-specific .env.local/.env, then monorepo root .env.local/.env
 * - Staging/production/test: app-specific .env.<env>, then monorepo root .env.<env>
 *
 * @example
 * import { bootstrap } from '@libs/bootstrap';
 * bootstrap({ app: 'api' });
 */
export function bootstrap(options: BootstrapOptions): void {
  const { app, maxListeners = 50 } = options;
  const env = process.env.NODE_ENV as string | undefined;
  const isProduction = env === 'production';
  const isStaging = env === 'staging';
  const isTest = env === 'test';

  // Build list of env files to load
  // CWD is apps/server/, so:
  // - ../../.env is the monorepo root
  // - [app]/.env is the service-specific env
  //
  // dotenv.config() is first-wins (won't override existing process.env vars),
  // so load service-specific files FIRST to give them priority:
  // 1. service/.env.local (personal overrides - highest priority)
  // 2. service/.env (service shared base)
  // 3. root/.env.local (monorepo local overrides)
  // 4. root/.env (monorepo base - lowest priority)
  const envFiles: string[] = isProduction
    ? [`${app}/.env.production`, `../../.env.production`]
    : isStaging
      ? [`${app}/.env.staging`, `../../.env.staging`]
      : isTest
        ? [`${app}/.env.test`, `../../.env.test`]
        : [
            `${app}/.env.local`,
            `${app}/.env`,
            `../../.env.local`,
            `../../.env`,
          ];

  // Load each env file if it exists (first loaded wins due to dotenv behavior)
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile });
    }
  }

  // Increase EventEmitter max listeners to prevent memory leak warnings
  EventEmitter.defaultMaxListeners = maxListeners;
  process.setMaxListeners(maxListeners);
}

/**
 * Setup graceful shutdown handlers.
 * Note: Uses console because Logger may not be available during shutdown.
 */
export function setupGracefulShutdown(): void {
  const handleShutdown = (signal: string) => {
    console.warn(`Received ${signal}, shutting down gracefully`);
    process.exit(0);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

/**
 * Configure the standard Nest service shell used by most Genfeed services.
 *
 * This captures the repeated trust-proxy, shutdown hook, and root health
 * redirect setup while still allowing service-specific redirect targets.
 */
export function setupServiceShell(
  app: NestExpressApplication,
  options: ServiceShellOptions = {},
): void {
  const { redirectPaths = ['/'], redirectTarget, trustProxy = 1 } = options;

  app.set('trust proxy', trustProxy);
  app.enableShutdownHooks();

  if (!redirectTarget) {
    return;
  }

  const server = app.getHttpAdapter().getInstance();
  for (const path of redirectPaths) {
    server.get(path, (_req: Request, res: Response) => {
      res.redirect(redirectTarget);
    });
  }
}

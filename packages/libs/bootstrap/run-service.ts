import { LoggerService } from '@libs/logger/logger.service';
import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type ServiceShellOptions,
  setupGracefulShutdown,
  setupServiceShell,
} from './env-loader';

/**
 * Minimal ConfigService shape the runner needs — just the `PORT` lookup.
 *
 * The return type is widened to `number | string` so the Joi-validated services
 * (whose `get('PORT')` resolves to `number` via `baseSchema`) satisfy it as well
 * as any service that surfaces the raw string. `app.listen()` accepts both.
 */
interface PortConfigService {
  get(key: 'PORT'): number | string;
}

export interface RunServiceOptions {
  /** Root application module to instantiate. */
  module: Type;
  /** Service `ConfigService` class; resolved from the DI container to read `PORT`. */
  configService: Type<PortConfigService>;
  /** Lowercase service id used in startup/error log lines (e.g. `images`). */
  serviceName: string;
  /**
   * Service shell (trust-proxy + root health redirect) options. Defaults to a
   * single `/` → `/v1/health` redirect; pass explicit `redirectPaths` for
   * services that also redirect `/docs`.
   */
  shell?: ServiceShellOptions;
  /** Global route prefix (default `v1`). */
  globalPrefix?: string;
}

/**
 * Standard Nest HTTP-service bootstrap shared by the leaf backend services
 * (images, discord, slack, telegram, videos, voices).
 *
 * Each `main.ts` still owns its Sentry `instrument` import and
 * `bootstrap({ app })` env call — those must run before this module and the
 * AppModule are imported — then delegates the otherwise-identical
 * NestFactory → listen → graceful-shutdown flow here.
 */
export async function runService(options: RunServiceOptions): Promise<void> {
  const {
    module,
    configService,
    serviceName,
    shell = { redirectTarget: '/v1/health' },
    globalPrefix = 'v1',
  } = options;

  const app = await NestFactory.create<NestExpressApplication>(module, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });

  const config = app.get(configService);
  const logger = app.get(LoggerService);
  const port = config.get('PORT');

  try {
    setupServiceShell(app, shell);

    app.setGlobalPrefix(globalPrefix);

    await app.listen(port);
    logger.debug(`${serviceName} service is running on port ${port}`);

    setupGracefulShutdown();
  } catch (error: unknown) {
    logger.error(`Failed to start ${serviceName} service:`, error);
    process.exit(1);
  }
}

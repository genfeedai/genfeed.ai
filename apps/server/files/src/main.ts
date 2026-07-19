import './instrument';

import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';

bootstrap({ app: 'files' });

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { AppModule } from '@files/app.module';
import { ConfigService } from '@files/config/config.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  GENFEED_CORS_ALLOWED_METHODS,
  GENFEED_CORS_PREFLIGHT_MAX_AGE_SECONDS,
} from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get<LoggerService>(LoggerService);
  const port = configService.get('PORT');

  try {
    setupServiceShell(app, {
      redirectPaths: ['/', '/docs'],
      redirectTarget: '/v1/health',
    });

    // biome-ignore lint/correctness/useHookAtTopLevel: Nest application method, not a React hook
    app.useLogger(logger);

    app.setGlobalPrefix('v1');

    const tempDir = configService.get('TEMP_DIR');
    if (tempDir && !fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      logger.debug(`Created temp directory: ${tempDir}`);
    }

    app.enableCors({
      credentials: true,
      maxAge: GENFEED_CORS_PREFLIGHT_MAX_AGE_SECONDS,
      methods: GENFEED_CORS_ALLOWED_METHODS,
      origin: configService.get('GENFEEDAI_API_URL'),
    });

    app.use(express.urlencoded({ extended: false, limit: '100mb' }));
    app.use(express.json({ limit: '100mb' }));

    // Serve local files in self-hosted mode (LOCAL + HYBRID)
    if (isSelfHostedDeployment()) {
      const localStorageDir =
        configService.get('GENFEED_STORAGE_PATH') ??
        path.join(os.homedir(), '.genfeed', 'data', 'files');

      if (!fs.existsSync(localStorageDir)) {
        fs.mkdirSync(localStorageDir, { recursive: true });
      }

      app.use(
        '/local',
        express.static(localStorageDir, {
          immutable: true,
          maxAge: '1d',
        }),
      );

      logger.debug(`Serving local files from ${localStorageDir}`);
    }

    await app.listen(port);

    logger.debug(`Files processing service is running on port ${port}`);
    logger.debug(`Connected to Redis: ${configService.get('REDIS_URL')}`);
    logger.debug(`Using S3 bucket: ${configService.get('AWS_S3_BUCKET')}`);
  } catch (error: unknown) {
    logger.error('Failed to start files service:', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

void main();
setupGracefulShutdown();

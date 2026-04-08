require('./instrument');

import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';

bootstrap({ app: 'files' });

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppModule } from '@files/app.module';
import { ConfigService } from '@files/config/config.service';
import { IS_SELF_HOSTED } from '@genfeedai/config';
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

    app.useLogger(logger);

    app.setGlobalPrefix('v1');

    const tempDir = configService.get('TEMP_DIR');
    if (tempDir && !fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      logger.debug(`Created temp directory: ${tempDir}`);
    }

    app.enableCors({
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      origin: configService.get('GENFEEDAI_API_URL'),
    });

    app.use(express.urlencoded({ extended: false, limit: '100mb' }));
    app.use(express.json({ limit: '100mb' }));

    // Serve local files in self-hosted mode (LOCAL + HYBRID)
    if (IS_SELF_HOSTED) {
      const localStorageDir =
        process.env.GENFEED_STORAGE_PATH ??
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
  }
}

void main();
setupGracefulShutdown();

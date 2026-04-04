require('./instrument');

import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';

bootstrap({ app: 'files' });

import fs from 'node:fs';
import { AppModule } from '@files/app.module';
import { ConfigService } from '@files/config/config.service';
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

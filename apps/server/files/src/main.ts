import './instrument';

import {
  bootstrap,
  registerGracefulDrain,
  setupServiceShell,
} from '@libs/bootstrap';

bootstrap({ app: 'files' });

import fs from 'node:fs';
import process from 'node:process';
import { AppModule } from '@files/app.module';
import { ConfigService } from '@files/config/config.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  resolveContainedPathWithoutSymlinks,
  resolveLocalStorageBaseDir,
} from '@genfeedai/storage';
import {
  GENFEED_CORS_ALLOWED_METHODS,
  GENFEED_CORS_PREFLIGHT_MAX_AGE_SECONDS,
} from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
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

  registerGracefulDrain({
    app,
    httpServer: app.getHttpServer(),
    logger,
    serviceName: 'files',
  });

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

    // Serve local files in self-hosted mode (LOCAL + HYBRID). The same resolver
    // backs LocalStorageProvider, so the served root is the written root — on
    // desktop that is Electron's userData directory, reachable over loopback
    // only, which is why direct reads need no signed URL.
    if (isSelfHostedDeployment()) {
      const localStorageDir = resolveLocalStorageBaseDir(
        configService.get('GENFEED_STORAGE_PATH'),
      );

      if (!fs.existsSync(localStorageDir)) {
        fs.mkdirSync(localStorageDir, { recursive: true });
      }

      // `express.static` normalizes `../` but still reads through symlinks, and
      // the root here is the operator's real disk. Reuse the driver's guard so
      // the read path rejects exactly what the write path rejects.
      app.use(
        '/local',
        (request: Request, response: Response, next: NextFunction) => {
          let requestedPath: string;

          try {
            requestedPath = decodeURIComponent(request.path);
          } catch {
            response.sendStatus(HttpStatus.BAD_REQUEST);
            return;
          }

          resolveContainedPathWithoutSymlinks(
            localStorageDir,
            `.${requestedPath}`,
            (message) => new Error(message),
          )
            .then(() => next())
            .catch(() => response.sendStatus(HttpStatus.FORBIDDEN));
        },
      );

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

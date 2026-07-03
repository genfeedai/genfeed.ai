import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';
import '@discord/instrument';

bootstrap({ app: 'discord' });

import process from 'node:process';
import { AppModule } from '@discord/app.module';
import { ConfigService } from '@discord/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

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
    setupServiceShell(app, { redirectTarget: '/v1/health' });

    app.setGlobalPrefix('v1');

    await app.listen(port);
    logger.debug(`Discord service is running on port ${port}`);

    setupGracefulShutdown();
  } catch (error: unknown) {
    logger.error('Failed to start discord service:', error);
    process.exit(1);
  }
}

void main();

import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';
import '@telegram/instrument';

bootstrap({ app: 'telegram' });

import { LoggerService } from '@libs/logger/logger.service';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '@telegram/app.module';
import { ConfigService } from '@telegram/config/config.service';

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

    app.setGlobalPrefix('v1');

    await app.listen(port);
    logger.debug(`Telegram service is running on port ${port}`);

    setupGracefulShutdown();
  } catch (error: unknown) {
    logger.error('Failed to start telegram service:', error);
    process.exit(1);
  }
}

void main();

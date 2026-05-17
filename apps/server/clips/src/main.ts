import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';
import '@clips/instrument';

bootstrap({ app: 'clips' });

import process from 'node:process';
import { AppModule } from '@clips/app.module';
import { ConfigService } from '@clips/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function main() {
  let logger: LoggerService | undefined;
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      abortOnError: false,
      logger: ['error'],
      snapshot: true,
    });

    const configService = app.get(ConfigService);
    logger = app.get<LoggerService>(LoggerService);
    const port = configService.get('PORT');

    setupServiceShell(app, {
      redirectPaths: ['/', '/docs'],
      redirectTarget: '/v1/health',
    });

    app.setGlobalPrefix('v1');

    await app.listen(port);
    logger.debug(`Clips service is running on port ${port}`);

    setupGracefulShutdown();
  } catch (error: unknown) {
    if (logger) {
      logger.error('Failed to start clips service:', error);
    } else {
      console.error('Failed to start clips service:', error);
    }
    process.exit(1);
  }
}

void main().catch((error: unknown) => {
  console.error('Failed to start clips service:', error);
  process.exit(1);
});

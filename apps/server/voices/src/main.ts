import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';
import '@voices/instrument';

bootstrap({ app: 'voices' });

import { LoggerService } from '@libs/logger/logger.service';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '@voices/app.module';
import { ConfigService } from '@voices/config/config.service';

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
    logger.debug(`Voices service is running on port ${port}`);

    setupGracefulShutdown();
  } catch (error: unknown) {
    logger.error('Failed to start voices service:', error);
    process.exit(1);
  }
}

main();

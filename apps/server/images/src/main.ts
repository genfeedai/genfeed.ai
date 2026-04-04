import '@images/instrument';
import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';

bootstrap({ app: 'images' });

import { AppModule } from '@images/app.module';
import { ConfigService } from '@images/config/config.service';
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
    logger.debug(`Images service is running on port ${port}`);

    setupGracefulShutdown();
  } catch (error: unknown) {
    logger.error('Failed to start images service:', error);
    process.exit(1);
  }
}

main();

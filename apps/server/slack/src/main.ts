import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';
import '@slack/instrument';

bootstrap({ app: 'slack' });

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '@slack/app.module';
import { ConfigService } from '@slack/config/config.service';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Slack');
  const port = configService.get('PORT');

  try {
    setupServiceShell(app, { redirectTarget: '/v1/health' });

    app.setGlobalPrefix('v1');

    await app.listen(port);
    logger.debug(`Slack service is running on port ${port}`);

    setupGracefulShutdown();
  } catch (error: unknown) {
    logger.error('Failed to start slack service:', error);
    process.exit(1);
  }
}

main();

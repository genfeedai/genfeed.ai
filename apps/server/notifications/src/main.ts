import {
  bootstrap,
  setupGracefulShutdown,
  setupServiceShell,
} from '@libs/bootstrap';
import '@notifications/instrument';

bootstrap({ app: 'notifications' });

import { RedisIoAdapter } from '@libs/adapters/redis-io.adapter';
import { getGenfeedCorsOrigins } from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '@notifications/app.module';
import { ConfigService } from '@notifications/config/config.service';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get<LoggerService>(LoggerService);
  const port = configService.get('PORT');

  // Configure Redis Socket.IO adapter
  const redisTls = Boolean(configService.get('REDIS_TLS'));
  const redisIoAdapter = new RedisIoAdapter(
    app,
    configService.get('REDIS_URL') || 'redis://localhost:6379',
    logger,
    redisTls,
  );

  try {
    setupServiceShell(app, {
      redirectPaths: ['/', '/docs'],
      redirectTarget: '/v1/health',
    });

    app.setGlobalPrefix('v1');

    // Enable CORS for API communication
    app.enableCors({
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      origin: getGenfeedCorsOrigins({
        chromeExtensionId: configService.get('CHROME_EXTENSION_ID'),
        isDevelopment: configService.get('NODE_ENV') === 'development',
      }),
    });

    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);

    await app.listen(port);
    logger.debug(`Notifications service is running on port ${port}`);

    setupGracefulShutdown();
  } catch (error: unknown) {
    logger.error('Failed to start notifications service:', error);
    process.exit(1);
  }
}

void main();

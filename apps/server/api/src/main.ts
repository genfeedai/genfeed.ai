require('./instrument');

import { bootstrap, setupGracefulShutdown } from '@libs/bootstrap';

bootstrap({ app: 'api' });

import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { AppModule } from '@api/app.module';
import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { ConfigService } from '@api/config/config.service';
import { DocsService } from '@api/endpoints/docs/docs.service';
import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { HttpExceptionFilter } from '@api/helpers/filters/http-exception/http-exception.filter';
import { MongoExceptionFilter } from '@api/helpers/filters/mongo-exception/mongo-exception.filter';
import { MongoValidationExceptionFilter } from '@api/helpers/filters/mongo-validation-exception/mongo-validation-exception.filter';
import {
  APIMetricsInterceptor,
  PerformanceInterceptor,
} from '@api/helpers/interceptors/performance/performance.interceptor';
import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { ResponseIdNormalizerInterceptor } from '@api/interceptors/response-id-normalizer.interceptor';
import { TimeoutInterceptor } from '@api/interceptors/timeout.interceptor';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getGenfeedCorsOrigins } from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import {
  buildBullMQConnection,
  parseRedisConnection,
} from '@libs/redis/redis-connection.utils';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { Queue } from 'bullmq';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

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
    app.set('trust proxy', 1);
    app.enableShutdownHooks();

    const version = process.env.npm_package_version || '1.0.0';
    const description = process.env.npm_package_description || 'Genfeed.ai API';

    const options = new DocumentBuilder()
      .setTitle('Genfeed.ai API')
      .setDescription(description)
      .setVersion(version)
      .addBearerAuth()
      .addServer('/v1')
      .build();

    let document: OpenAPIObject | null = null;
    try {
      document = SwaggerModule.createDocument(app, options);
    } catch (swaggerError) {
      logger.error('Swagger document generation failed', swaggerError);
    }

    const docsService = app.get(DocsService);
    if (document) {
      docsService.setOpenApiDocument(document);
    }

    const gptActionsSpec = require('./config/gpt-actions-openapi.json');
    docsService.setGptActionsSpec(gptActionsSpec);

    app.enableCors({
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      origin: getGenfeedCorsOrigins({
        chromeExtensionId: configService.get('CHROME_EXTENSION_ID'),
        isDevelopment: configService.get('NODE_ENV') === 'development',
      }),
    });

    app.setGlobalPrefix('v1');

    app.use(express.urlencoded({ extended: false, limit: '50mb' }));

    // Raw body middleware for webhook signature verification
    app.use(
      '/v1/webhooks/stripe',
      express.raw({ limit: '10mb', type: 'application/json' }),
    );
    app.use(
      '/v1/webhooks/vercel',
      express.raw({ limit: '10mb', type: 'application/json' }),
    );

    app.use(express.json({ limit: '50mb' }));

    const limitMultiplier =
      configService.get('NODE_ENV') === 'production' ? 100 : 1000;
    const limiter = rateLimit({
      limit: 100 * limitMultiplier,
      skip: (req) =>
        req.path.startsWith('/v1/health') ||
        req.path === '/v1/openapi.json' ||
        req.path === '/v1/gpt-actions.json',
      windowMs: 1 * 60 * 1000,
    });

    app.useStaticAssets(join(__dirname, '..', 'assets'));
    app.setBaseViewsDir(join(__dirname, '..', 'views'));

    app.use(limiter);
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            connectSrc: [
              "'self'",
              'wss://*.genfeed.ai',
              'https://*.genfeed.ai',
              'https://cdn.genfeed.ai',
              'https://staging-cdn.genfeed.ai',
            ],
            defaultSrc: ["'self'"],
            fontSrc: ["'self'", 'data:', 'https:'],
            frameSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            objectSrc: ["'none'"],
            scriptSrc: [
              "'self'",
              ...(process.env.NODE_ENV === 'production'
                ? []
                : ["'unsafe-inline'", "'unsafe-eval'"]),
            ],
            styleSrc: ["'self'", "'unsafe-inline'"],
            upgradeInsecureRequests:
              process.env.NODE_ENV === 'production' ? [] : null,
          },
        },
        crossOriginEmbedderPolicy: false,
      }),
    );

    app.use(cookieParser());

    app.use(
      compression({
        filter: (req: Request, res: Response) => {
          if (req.headers['x-no-compression']) {
            return false;
          }
          return compression.filter(req, res);
        },
        level: 6,
        threshold: 1024,
      }),
    );

    app.useGlobalPipes(new ValidationPipe());
    app.useLogger(logger);

    // Get optional services
    const redisCacheInterceptor = app.get(RedisCacheInterceptor);
    const memoryMonitor = app.get(MemoryMonitorService, { strict: false });
    const logApiUsage =
      configService.get('NODE_ENV') !== 'production' ||
      configService.get('API_METRICS_LOGGING') === 'true';

    const interceptors = [
      new ResponseIdNormalizerInterceptor(),
      ...(redisCacheInterceptor ? [redisCacheInterceptor] : []),
      new TimeoutInterceptor(),
      new PerformanceInterceptor(logger, memoryMonitor),
      new APIMetricsInterceptor(logger, logApiUsage),
    ];

    app.useGlobalInterceptors(...interceptors);

    app.useGlobalFilters(new AllExceptionFilter(logger, configService));
    app.useGlobalFilters(new HttpExceptionFilter(logger, configService));
    app.useGlobalFilters(new MongoExceptionFilter(logger, configService));
    app.useGlobalFilters(
      new MongoValidationExceptionFilter(logger, configService),
    );

    // Bull Board setup
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    const redisConfig = parseRedisConnection(configService);
    const defaultQueue = new Queue('default', {
      connection: buildBullMQConnection(redisConfig),
    });

    createBullBoard({
      queues: [new BullMQAdapter(defaultQueue)],
      serverAdapter,
    });

    const expressApp = app.getHttpAdapter().getInstance();

    expressApp.get('/', (_req: Request, res: Response) => {
      res.status(200).json({
        docs: '/v1/openapi.json',
        health: '/v1/health',
        name: 'Genfeed.ai API',
        status: 'ok',
      });
    });

    expressApp.get('/robots.txt', (_req: Request, res: Response) => {
      res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    });

    const bullBoardAuth = (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      const expectedToken = configService.get('BULL_BOARD_AUTH_TOKEN');

      if (!expectedToken) {
        logger.warn('Bull Board: No auth token configured, access denied');
        return res.status(401).json({
          detail: 'Bull Board authentication not configured',
          title: 'Unauthorized',
        });
      }

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const tokenBuf = Buffer.from(token);
        const expectedBuf = Buffer.from(expectedToken);
        if (
          tokenBuf.length === expectedBuf.length &&
          timingSafeEqual(tokenBuf, expectedBuf)
        ) {
          return next();
        }
      }

      res.status(401).json({
        detail: 'Valid authentication token required to access Bull Board',
        title: 'Unauthorized',
      });
    };

    expressApp.use('/admin/queues', bullBoardAuth, serverAdapter.getRouter());

    await app.listen(port);
    logger.debug(`API service is running on port ${port}`);
  } catch (error: unknown) {
    logger.error('Failed to start API service:', error);
  }
}

void main();
setupGracefulShutdown();

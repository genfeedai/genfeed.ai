import './instrument';

import { bootstrap, setupGracefulShutdown } from '@libs/bootstrap';

bootstrap({ app: 'api' });

import { timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { AppModule } from '@api/app.module';
import { BetterAuthService } from '@api/auth/better-auth/better-auth.service';
import { shouldBypassBetterAuthHandler } from '@api/auth/better-auth/better-auth-route-bypass.util';
import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { ConfigService } from '@api/config/config.service';
import { DocsService } from '@api/endpoints/docs/docs.service';
import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { DatabaseExceptionFilter } from '@api/helpers/filters/database-exception/database-exception.filter';
import { HttpExceptionFilter } from '@api/helpers/filters/http-exception/http-exception.filter';
import {
  APIMetricsInterceptor,
  PerformanceInterceptor,
} from '@api/helpers/interceptors/performance/performance.interceptor';
import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { TimeoutInterceptor } from '@api/interceptors/timeout.interceptor';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getGenfeedCorsOptions } from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import {
  buildBullMQConnection,
  parseRedisConnection,
} from '@libs/redis/redis-connection.utils';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import gptActionsSpec from './config/gpt-actions-openapi.json';

const apiDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_API_LISTEN_TIMEOUT_MS = 120_000;

function parsePositiveTimeoutMs(
  value: string | undefined,
  fallbackMs: number,
): number {
  const timeoutMs = Number(value ?? fallbackMs);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : fallbackMs;
}

async function withStartupTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(timeoutMessage)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function main() {
  let logger: LoggerService | undefined;

  try {
    console.info('API bootstrap: creating Nest application');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      abortOnError: false,
      logger: ['error'],
      snapshot: true,
    });
    console.info('API bootstrap: Nest application created');

    const configService = app.get(ConfigService);
    logger = app.get<LoggerService>(LoggerService);
    const port = configService.get('PORT');
    const apiListenTimeoutMs = parsePositiveTimeoutMs(
      configService.get('API_LISTEN_TIMEOUT_MS'),
      DEFAULT_API_LISTEN_TIMEOUT_MS,
    );

    app.set('trust proxy', 1);
    app.enableShutdownHooks();

    const nodeEnv = configService.get('NODE_ENV');
    const version =
      configService.get('npm_package_version') ??
      configService.get('VERSION') ??
      '1.0.0';
    const description =
      configService.get('npm_package_description') ?? 'Genfeed.ai API';

    const options = new DocumentBuilder()
      .setTitle('Genfeed.ai API')
      .setDescription(description)
      .setVersion(version)
      .addBearerAuth()
      .addServer('/v1')
      .build();

    const docsService = app.get(DocsService);
    docsService.setOpenApiDocumentFactory(() =>
      SwaggerModule.createDocument(app, options),
    );
    docsService.setGptActionsSpec(gptActionsSpec);

    app.enableCors(
      getGenfeedCorsOptions({
        chromeExtensionId: configService.get('CHROME_EXTENSION_ID'),
        isDevelopment: nodeEnv === 'development',
      }),
    );

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

    // Better Auth parses its own request bodies, so its handler must be mounted
    // BEFORE express.json().
    const betterAuthService = app.get(BetterAuthService, { strict: false });
    if (betterAuthService?.isEnabled) {
      app.use(
        betterAuthService.basePath,
        (req: Request, res: Response, next: NextFunction) => {
          if (shouldBypassBetterAuthHandler(req.method, req.path)) {
            return next();
          }

          return betterAuthService.nodeHandler(req, res, next);
        },
      );
      logger.debug(
        `Better Auth handler mounted at ${betterAuthService.basePath}`,
      );
    }

    app.use(express.json({ limit: '50mb' }));

    const limitMultiplier = nodeEnv === 'production' ? 100 : 1000;
    const limiter = rateLimit({
      limit: 100 * limitMultiplier,
      skip: (req) =>
        req.path.startsWith('/v1/health') ||
        req.path === '/v1/openapi.json' ||
        req.path === '/v1/gpt-actions.json',
      windowMs: 1 * 60 * 1000,
    });

    app.useStaticAssets(join(apiDir, '..', 'assets'));
    app.setBaseViewsDir(join(apiDir, '..', 'views'));

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
              ...(nodeEnv === 'production'
                ? []
                : ["'unsafe-inline'", "'unsafe-eval'"]),
            ],
            styleSrc: ["'self'", "'unsafe-inline'"],
            upgradeInsecureRequests: nodeEnv === 'production' ? [] : null,
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
      nodeEnv !== 'production' ||
      configService.get('API_METRICS_LOGGING') === 'true';

    const interceptors = [
      ...(redisCacheInterceptor ? [redisCacheInterceptor] : []),
      new TimeoutInterceptor(),
      new PerformanceInterceptor(logger, configService, memoryMonitor),
      new APIMetricsInterceptor(logger, logApiUsage),
    ];

    app.useGlobalInterceptors(...interceptors);

    // Nest resolves global filters in REVERSE registration order (last
    // registered, first matched). HttpExceptionFilter must be registered last
    // so HttpExceptions (incl. 4xx like NotFoundException) hit its
    // status-aware Sentry suppression instead of a catch-all filter.
    app.useGlobalFilters(new AllExceptionFilter(logger, configService));
    app.useGlobalFilters(new DatabaseExceptionFilter(logger, configService));
    app.useGlobalFilters(new HttpExceptionFilter(logger, configService));

    // Bull Board setup — monitors every BullMQ queue across api, workers,
    // files, and clips. Keep this list in sync with the registerQueue calls in
    // apps/server/workers/src/queues/queues.module.ts,
    // apps/server/files/src/queues/queues.module.ts, and
    // apps/server/clips/src/app.module.ts.
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    const redisConfig = parseRedisConnection(configService);
    const bullBoardConnection = buildBullMQConnection(redisConfig);
    const monitoredQueueNames = [
      'default',
      // analytics
      'analytics-facebook',
      'analytics-social',
      'analytics-sync',
      'analytics-threads',
      'analytics-twitter',
      'analytics-youtube',
      // ads
      'ad-bulk-upload',
      'ad-insights-aggregation',
      'ad-optimization',
      'ad-sync-google',
      'ad-sync-meta',
      'ad-sync-tiktok',
      // workflows + agents
      'workflow-execution',
      'batch-workflow',
      'agent-run',
      'orchestrator-run',
      'campaign-memory-extraction',
      'triggers.evaluate',
      'campaign-processing',
      // content
      'article-generation',
      'batch-content',
      'content-optimization',
      'content-pipeline',
      'pattern-extraction',
      // clips
      'clip-analyze',
      'clip-factory',
      'clipper-processing',
      // files service
      'file-processing',
      'image-processing',
      'task-processing',
      'video-processing',
      'youtube-processing',
      // misc
      'credit-deduction',
      'email-digest',
      'heygen-poll',
      'reply-bot-polling',
      'telegram-distribute',
      'webhook-client',
      'workspace-task',
    ];

    createBullBoard({
      queues: monitoredQueueNames.map(
        (name) =>
          new BullMQAdapter(
            new Queue(name, { connection: bullBoardConnection }),
          ),
      ),
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
        logger?.warn('Bull Board: No auth token configured, access denied');
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

    console.info(`API bootstrap: starting listener on port ${port}`);
    await withStartupTimeout(
      app.listen(port),
      apiListenTimeoutMs,
      `API listen timed out after ${apiListenTimeoutMs}ms before serving port ${port}`,
    );
    console.info(`API bootstrap: listener ready on port ${port}`);
    logger.debug(`API service is running on port ${port}`);
  } catch (error: unknown) {
    logger?.error('Failed to start API service:', error);
    console.error('API bootstrap failed:', error);
    // A failed bootstrap leaves the process alive but unbound if Redis/BullMQ
    // handles remain open. Exit loudly so ECS and boot-smoke fail fast.
    process.exit(1);
  }
}

// Hermetic boot-check gate (CI, on PRs): by the time module evaluation reaches
// here, every import above — including AppModule and its whole provider graph —
// has loaded. A circular-import TDZ (e.g. #711's "Cannot access 'X' before
// initialization") throws during that import and crashes the process before this
// line, so exit 0 here means the compiled graph loads cleanly. We exit BEFORE
// NestFactory/config so the check needs no env, DB, or Redis — unlike the
// deploy-time boot-smoke ECS task, which boots the full listener against the
// migrated DB. Note: vitest can't reproduce this TDZ (its SWC/ESM
// resolution differs); only the compiled build does, which is what CI runs here.
if (process.env.BOOT_CHECK === '1') {
  process.exit(0);
}

void main();
setupGracefulShutdown();

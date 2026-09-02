import './instrument';

import { bootstrap, setupGracefulShutdown } from '@libs/bootstrap';

bootstrap({ app: 'api' });

import { timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { BetterAuthService } from '@api/auth/better-auth/better-auth.service';
import { attachBetterAuthRequestLog } from '@api/auth/better-auth/better-auth-request-log.util';
import { shouldBypassBetterAuthHandler } from '@api/auth/better-auth/better-auth-route-bypass.util';
import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { BULL_BOARD_QUEUE_NAMES } from '@api/config/bull-board-queue-names';
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
import {
  buildStableOpenApiDocument,
  createOpenApiBuilderOptions,
} from '@api/helpers/utils/openapi/openapi-document.util';
import { maybeEmitOpenApiDocument } from '@api/helpers/utils/openapi/openapi-emit.util';
import { TimeoutInterceptor } from '@api/interceptors/timeout.interceptor';
import { buildOAuthAuthorizationServerMetadata } from '@api/oauth/oauth-metadata.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
  initializeLicenseVerification,
  reportLicenseVerificationWarning,
} from '@genfeedai/config/license-server';
import { assertLiveArticleColumnContract } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import {
  getGenfeedCorsOptions,
  shouldAllowLocalCorsOrigins,
} from '@libs/config/cors.config';
import { LoggerService } from '@libs/logger/logger.service';
import {
  buildBullMQConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
const bootstrapLogger = new Logger('ApiBootstrap');

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
    await initializeLicenseVerification();
    const { AppModule } = await import('@api/app.module');

    // Hermetic boot-check gate (CI, on PRs): license verification and the
    // dynamic AppModule import complete before this exit, so the full compiled
    // provider graph still loads without requiring env, DB, or Redis.
    if (process.env.BOOT_CHECK === '1') {
      process.exit(0);
    }

    bootstrapLogger.log('API bootstrap: creating Nest application');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      abortOnError: false,
      logger: ['error'],
      snapshot: true,
    });
    bootstrapLogger.log('API bootstrap: Nest application created');

    // Headless OpenAPI emit gate (#1247): writes the deterministic spec
    // artifact and exits before any middleware, queues, or the listener.
    if (maybeEmitOpenApiDocument(app)) {
      process.exit(0);
    }

    const configService = app.get(ConfigService);
    logger = app.get<LoggerService>(LoggerService);
    reportLicenseVerificationWarning(logger);
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

    const options = createOpenApiBuilderOptions({ description, version });

    const docsService = app.get(DocsService);
    docsService.setOpenApiDocumentFactory(() =>
      buildStableOpenApiDocument(app, options),
    );
    docsService.setGptActionsSpec(gptActionsSpec);

    app.enableCors(
      getGenfeedCorsOptions({
        chromeExtensionId: configService.get('CHROME_EXTENSION_ID'),
        isDevelopment: shouldAllowLocalCorsOrigins(nodeEnv),
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
    app.use(
      '/v1/webhooks/heygen',
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

          if (logger) {
            attachBetterAuthRequestLog(req, res, logger);
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
      legacyHeaders: true,
      limit: 100 * limitMultiplier,
      skip: (req) =>
        req.path.startsWith('/v1/health') ||
        req.path === '/v1/openapi.json' ||
        req.path === '/v1/gpt-actions.json',
      windowMs: 1 * 60 * 1000,
      standardHeaders: 'draft-6',
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

    // Bull Board setup — the canonical list automatically includes every
    // API/workers queue plus explicitly reviewed service-local queues.
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    const redisConfig = parseRedisConnectionForWorkload(
      configService,
      RedisWorkload.QUEUE,
    );
    const bullBoardConnection = buildBullMQConnection(redisConfig);
    createBullBoard({
      queues: BULL_BOARD_QUEUE_NAMES.map(
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

    expressApp.get(
      '/.well-known/oauth-authorization-server',
      (_req: Request, res: Response) => {
        res
          .set('Cache-Control', 'public, max-age=300')
          .status(200)
          .json(buildOAuthAuthorizationServerMetadata(configService));
      },
    );

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

    // Sentry API-GENFEED-AI-71 / 72: refuse to bind the listener when the
    // running Prisma Article client still selects the retired title column or
    // the live table is missing `label`/`summary`. BOOT_CHECK and OpenAPI emit
    // exit above, so this only gates real traffic.
    bootstrapLogger.log('API bootstrap: verifying public article schema');
    const prisma = app.get(PrismaService);
    await assertLiveArticleColumnContract({
      clientFields: Object.keys(prisma.article.fields),
      findPresentColumns: async () => {
        const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'articles'
            AND table_schema = current_schema()
        `;
        return rows.map((row) => row.column_name);
      },
    });

    bootstrapLogger.log(`API bootstrap: starting listener on port ${port}`);
    await withStartupTimeout(
      app.listen(port),
      apiListenTimeoutMs,
      `API listen timed out after ${apiListenTimeoutMs}ms before serving port ${port}`,
    );
    bootstrapLogger.log(`API bootstrap: listener ready on port ${port}`);
    logger.debug(`API service is running on port ${port}`);
  } catch (error: unknown) {
    logger?.error('Failed to start API service:', error);
    bootstrapLogger.error(
      'API bootstrap failed',
      error instanceof Error ? error.stack : String(error),
    );
    // A failed bootstrap leaves the process alive but unbound if Redis/BullMQ
    // handles remain open. Exit loudly so ECS and boot-smoke fail fast.
    process.exit(1);
  }
}

void main();
setupGracefulShutdown();

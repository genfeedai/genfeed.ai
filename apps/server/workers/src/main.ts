require('./instrument');

import { bootstrap } from '@libs/bootstrap';

bootstrap({ app: 'workers' });

import type { Server } from 'node:http';
import { LoggerService } from '@libs/logger/logger.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@workers/app.module';
import { ConfigService } from '@workers/config/config.service';
import express, { type Request, type Response } from 'express';

interface HealthResponse {
  service: string;
  status: string;
  timestamp: string;
  version: string;
  memory?: NodeJS.MemoryUsage;
  uptime?: number;
}

function getVersion(): string {
  return process.env.npm_package_version ?? process.env.VERSION ?? '1.0.0';
}

function getServiceName(): string {
  return process.env.SERVICE_NAME ?? 'workers';
}

function buildHealthResponse(status: string): HealthResponse {
  return {
    service: getServiceName(),
    status,
    timestamp: new Date().toISOString(),
    version: getVersion(),
  };
}

function registerHealthRoutes(server: ReturnType<typeof express>): void {
  server.get('/', (_req: Request, res: Response) => {
    res.redirect('/v1/health');
  });

  server.get('/v1/health', (_req: Request, res: Response) => {
    res.json(buildHealthResponse('ok'));
  });

  server.get('/v1/health/detailed', (_req: Request, res: Response) => {
    res.json({
      ...buildHealthResponse('ok'),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    });
  });

  server.get('/v1/health/ready', (_req: Request, res: Response) => {
    res.json(buildHealthResponse('ready'));
  });

  server.get('/v1/health/live', (_req: Request, res: Response) => {
    res.json(buildHealthResponse('alive'));
  });
}

async function startHealthServer(
  port: number,
  logger: LoggerService,
): Promise<Server> {
  const server = express();
  registerHealthRoutes(server);

  return await new Promise<Server>((resolve, reject) => {
    const httpServer = server.listen(port, () => {
      logger.debug(`Workers health server is running on port ${port}`);
      resolve(httpServer);
    });

    httpServer.on('error', reject);
  });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get<LoggerService>(LoggerService);
  const port = configService.get('PORT');

  try {
    app.enableShutdownHooks();
    const healthServer = await startHealthServer(port, logger);

    logger.debug(`Workers service is running on port ${port}`);
    logger.debug(`Cron jobs are active`);

    const shutdown = async (signal: string) => {
      logger.warn(`Received ${signal}, shutting down workers gracefully`);

      await new Promise<void>((resolve, reject) => {
        healthServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await app.close();
      process.exit(0);
    };

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
  } catch (error: unknown) {
    logger.error('Failed to start workers service:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

void main();

import '../instrument';

import { bootstrap, setupGracefulShutdown } from '@libs/bootstrap';

bootstrap({ app: 'api' });

import process from 'node:process';
import { AppModule } from '@api/app.module';
import { WorkflowDeploymentBackfillService } from '@api/seeds/workflow-deployment-backfill.service';
import { LoggerService } from '@libs/logger/logger.service';
import { type INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const bootstrapLogger = new Logger('WorkflowBackfillMigration');
const APP_CLOSE_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  console.info('Workflow backfill migration booting');
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });
  console.info('Workflow backfill application context created');

  try {
    const logger = app.get<LoggerService>(LoggerService);
    const workflowDeploymentBackfill = app.get(
      WorkflowDeploymentBackfillService,
      { strict: false },
    );
    const report = await workflowDeploymentBackfill.run();
    console.info(
      `Workflow backfill migration completed ${JSON.stringify(report)}`,
    );

    logger.log('Workflow backfill migration completed', {
      report,
      service: 'WorkflowBackfillMigration',
    });
  } finally {
    await closeApplicationContext(app);
  }
}

async function closeApplicationContext(
  app: INestApplicationContext,
): Promise<void> {
  try {
    await withTimeout(
      app.close(),
      APP_CLOSE_TIMEOUT_MS,
      `Workflow backfill app.close timed out after ${APP_CLOSE_TIMEOUT_MS}ms`,
    );
    console.info('Workflow backfill application context closed');
  } catch (error: unknown) {
    console.warn(
      error instanceof Error
        ? error.message
        : `Workflow backfill app.close failed: ${String(error)}`,
    );
  }
}

async function withTimeout<T>(
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

void main()
  .then(() => {
    // Force a clean exit after app.close(). Lingering handles (DB pools, timers)
    // would otherwise keep this one-off ECS task alive until the 20-minute deploy
    // deadline, marking a successful backfill as a failed deploy. Sibling
    // entrypoints (main.ts boot-smoke) exit explicitly for the same reason.
    process.exit(0);
  })
  .catch((error: unknown) => {
    bootstrapLogger.error(
      'Workflow backfill migration failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  });

setupGracefulShutdown();

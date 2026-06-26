import '../instrument';

import { bootstrap, setupGracefulShutdown } from '@libs/bootstrap';

bootstrap({ app: 'api' });

import process from 'node:process';
import { AppModule } from '@api/app.module';
import { WorkflowDeploymentBackfillService } from '@api/seeds/workflow-deployment-backfill.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const bootstrapLogger = new Logger('WorkflowBackfillMigration');

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    logger: ['error'],
    snapshot: true,
  });

  try {
    const logger = app.get<LoggerService>(LoggerService);
    const workflowDeploymentBackfill = app.get(
      WorkflowDeploymentBackfillService,
      { strict: false },
    );
    const report = await workflowDeploymentBackfill.run();

    logger.log('Workflow backfill migration completed', {
      report,
      service: 'WorkflowBackfillMigration',
    });
  } finally {
    await app.close();
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

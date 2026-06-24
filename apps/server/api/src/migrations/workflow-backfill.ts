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

void main().catch((error: unknown) => {
  bootstrapLogger.error(
    'Workflow backfill migration failed',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});

setupGracefulShutdown();

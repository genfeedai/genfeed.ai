/**
 * Migration Script: Legacy Cron Jobs To Workflows
 *
 * Idempotently migrates legacy cron-jobs rows of type workflow_execution,
 * agent_strategy_execution, and newsletter_substack into schedule-enabled
 * workflow rows. Migrated cron jobs are marked so the legacy dynamic runner
 * ignores them.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/legacy-cron-jobs-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/legacy-cron-jobs-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/legacy-cron-jobs-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/legacy-cron-jobs-workflows.seed.ts --limit=100 --live
 *   bun run apps/server/api/scripts/seeds/legacy-cron-jobs-workflows.seed.ts --env=production --live
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { AppModule } from '@api/app.module';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const logger = new Logger('LegacyCronJobsWorkflowMigration');
const scriptDir = fileURLToPath(new URL('.', import.meta.url));

type MigrationArgs = {
  dryRun: boolean;
  env?: string;
  limit?: number;
  organizationId?: string;
};

function loadEnvFile(): void {
  const args = process.argv.slice(2);
  const envArg = args.find((arg) => arg.startsWith('--env='))?.split('=')[1];
  const envSuffix = envArg || 'local';
  const envPath = resolve(scriptDir, '..', '..', `.env.${envSuffix}`);

  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (envArg || !process.env[key]) {
        process.env[key] = value;
      }
    }
    logger.log(`Loaded env from .env.${envSuffix}`);
  } catch {
    logger.log(`No .env.${envSuffix} found, using process env / defaults`);
  }
}

function parseArgs(): MigrationArgs {
  const args = process.argv.slice(2);
  const limitArg = args
    .find((arg) => arg.startsWith('--limit='))
    ?.split('=')[1];
  const parsedLimit = limitArg ? Number(limitArg) : undefined;

  return {
    dryRun: !args.includes('--live'),
    env: args.find((arg) => arg.startsWith('--env='))?.split('=')[1],
    limit:
      parsedLimit !== undefined && Number.isFinite(parsedLimit)
        ? parsedLimit
        : undefined,
    organizationId: args
      .find((arg) => arg.startsWith('--organizationId='))
      ?.split('=')[1],
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'log', 'warn'],
  });

  try {
    const cronJobsService = app.get(CronJobsService);
    const report = await cronJobsService.migrateLegacyJobsToWorkflows({
      dryRun: args.dryRun,
      limit: args.limit,
      organizationId: args.organizationId,
    });

    logger.log(
      `${report.dryRun ? 'DRY RUN' : 'LIVE'} legacy cron migration summary: scanned=${report.scanned}, migrated=${report.migrated}, invalid=${report.invalid}, skipped=${report.skipped}, failed=${report.failed}${args.env ? `, env=${args.env}` : ''}`,
    );

    for (const detail of report.details) {
      if (detail.status === 'invalid' || detail.status === 'failed') {
        logger.warn(
          `${detail.status} cronJob=${detail.cronJobId} type=${detail.jobType ?? 'unknown'} errors=${(detail.errors ?? []).join('; ')}`,
        );
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  logger.error('Legacy cron jobs workflow migration failed', error);
  process.exit(1);
});

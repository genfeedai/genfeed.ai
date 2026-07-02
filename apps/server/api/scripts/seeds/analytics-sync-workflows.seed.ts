/**
 * Seed Script: Analytics Sync Workflows
 *
 * Idempotently provisions default-on analytics sync workflows for existing
 * organizations. New organizations are seeded automatically on creation.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts --env=production --live
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { AppModule } from '@api/app.module';
import { WorkflowTemplateSeederService } from '@api/collections/workflows/services/workflow-template-seeder.service';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const logger = new Logger('AnalyticsSyncWorkflowSeed');
const scriptDir = fileURLToPath(new URL('.', import.meta.url));

type SeedArgs = {
  dryRun: boolean;
  env?: string;
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

function parseArgs(): SeedArgs {
  const args = process.argv.slice(2);
  return {
    dryRun: !args.includes('--live'),
    env: args.find((arg) => arg.startsWith('--env='))?.split('=')[1],
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
    const workflowSeeder = app.get(WorkflowTemplateSeederService);
    const prisma = app.get(PrismaService);

    const where: Record<string, unknown> = { isDeleted: false };
    if (args.organizationId) {
      where.id = args.organizationId;
    }

    const organizations = await prisma.organization.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true },
      where: where as never,
    });

    logger.log(
      `${args.dryRun ? 'DRY RUN' : 'LIVE'} evaluating ${organizations.length} organization(s)${args.env ? ` for ${args.env}` : ''}`,
    );

    let processed = 0;
    let skipped = 0;

    for (const organization of organizations) {
      if (!organization.userId) {
        logger.warn(
          `Skipping organization ${organization.id} - no owner userId`,
        );
        skipped += 1;
        continue;
      }

      if (args.dryRun) {
        const existing = await prisma.workflow.findMany({
          select: { metadata: true },
          where: {
            isDeleted: false,
            organizationId: organization.id,
            OR: ANALYTICS_SYNC_WORKFLOW_TEMPLATES.map((template) => ({
              metadata: {
                equals: template.id,
                path: ['sourceTemplateId'],
              },
            })),
          },
        });
        const existingTemplateIds = new Set(
          existing
            .map((workflow) => {
              const metadata = workflow.metadata as Record<
                string,
                unknown
              > | null;
              return typeof metadata?.sourceTemplateId === 'string'
                ? metadata.sourceTemplateId
                : null;
            })
            .filter((value): value is string => Boolean(value)),
        );
        const missing = ANALYTICS_SYNC_WORKFLOW_TEMPLATES.filter(
          (template) => !existingTemplateIds.has(template.id),
        ).map((template) => template.id);

        logger.log(
          `[DRY RUN] org ${organization.id} missing ${missing.length}/${ANALYTICS_SYNC_WORKFLOW_TEMPLATES.length} analytics sync workflow(s): ${missing.join(', ') || 'none'}`,
        );
        processed += 1;
        continue;
      }

      await workflowSeeder.ensureAnalyticsSyncWorkflows(
        organization.userId,
        organization.id,
      );
      processed += 1;
    }

    logger.log(
      `Analytics sync workflow seed summary: processed=${processed}, skipped=${skipped}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  logger.error('Analytics sync workflow seed failed', error);
  process.exit(1);
});

/**
 * Seed Script: Daily Trends Digest Workflows
 *
 * Idempotently provisions the predetermined "Daily Trends Digest" workflow for
 * existing organizations (seeded ON by default; owners can pause it from the workflow list).
 * New organizations are seeded automatically on creation; this backfills the
 * organizations that existed before the feature shipped.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/trends-digest-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/trends-digest-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/trends-digest-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/trends-digest-workflows.seed.ts --env=production --live
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@genfeedai/prisma';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('TrendsDigestSeed');
const scriptDir = fileURLToPath(new URL('.', import.meta.url));

type SeedArgs = {
  dryRun: boolean;
  env?: string;
  organizationId?: string;
};

type SeedOrganization = {
  id: string;
  userId: string | null;
};

type ExistingDigestWorkflow = {
  id: string;
  isScheduleEnabled: boolean | null;
};

const DAILY_TRENDS_DIGEST_NODES = [
  {
    data: {
      config: {
        creditCost: 5,
        minViralScore: 70,
        platforms: ['tiktok', 'instagram', 'youtube', 'twitter'],
        topN: 5,
      },
      label: 'Assemble Trend Digest',
    },
    id: 'trend-digest',
    position: { x: 0, y: 120 },
    type: 'trendDigest',
  },
  {
    data: {
      config: {},
      label: 'Email Digest to Owner',
    },
    id: 'send-email',
    position: { x: 360, y: 120 },
    type: 'sendEmail',
  },
] as const;

const DAILY_TRENDS_DIGEST_EDGES = [
  {
    id: 'edge-digest-to',
    source: 'trend-digest',
    sourceHandle: 'to',
    target: 'send-email',
    targetHandle: 'to',
  },
  {
    id: 'edge-digest-subject',
    source: 'trend-digest',
    sourceHandle: 'subject',
    target: 'send-email',
    targetHandle: 'subject',
  },
  {
    id: 'edge-digest-html',
    source: 'trend-digest',
    sourceHandle: 'html',
    target: 'send-email',
    targetHandle: 'html',
  },
  {
    id: 'edge-digest-skipped',
    source: 'trend-digest',
    sourceHandle: 'skipped',
    target: 'send-email',
    targetHandle: 'skipped',
  },
  {
    id: 'edge-digest-reason',
    source: 'trend-digest',
    sourceHandle: 'reason',
    target: 'send-email',
    targetHandle: 'reason',
  },
] as const;

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

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

async function findExistingDigestWorkflow(
  prisma: PrismaClient,
  organizationId: string,
): Promise<ExistingDigestWorkflow | null> {
  return (await prisma.workflow.findFirst({
    select: { id: true, isScheduleEnabled: true },
    where: {
      isDeleted: false,
      metadata: {
        equals: 'daily-trends-digest',
        path: ['sourceTemplateId'],
      },
      organizationId,
    },
  })) as ExistingDigestWorkflow | null;
}

async function ensureDailyTrendsDigestWorkflow(params: {
  dryRun: boolean;
  organizationId: string;
  prisma: PrismaClient;
  userId: string;
}): Promise<'created' | 'enabled' | 'unchanged'> {
  const existing = await findExistingDigestWorkflow(
    params.prisma,
    params.organizationId,
  );

  if (existing) {
    if (existing.isScheduleEnabled) {
      return 'unchanged';
    }
    if (!params.dryRun) {
      await params.prisma.workflow.update({
        data: { isScheduleEnabled: true },
        where: { id: existing.id },
      });
    }
    return 'enabled';
  }

  if (!params.dryRun) {
    await params.prisma.workflow.create({
      data: {
        edges: DAILY_TRENDS_DIGEST_EDGES as never,
        executionCount: 0,
        inputVariables: [],
        isDeleted: false,
        isScheduleEnabled: true,
        label: 'Daily Trends Digest',
        metadata: {
          sourceTemplateId: 'daily-trends-digest',
          sourceType: 'seeded-template',
        },
        nodes: DAILY_TRENDS_DIGEST_NODES as never,
        organizationId: params.organizationId,
        progress: 0,
        schedule: '0 7 * * *',
        status: 'active',
        steps: [],
        timezone: 'UTC',
        userId: params.userId,
      },
    });
  }

  return 'created';
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = parseArgs();

  const prisma = createPrismaClient();

  try {
    const where: Record<string, unknown> = { isDeleted: false };
    if (args.organizationId) {
      where.id = args.organizationId;
    }

    const organizations = (await prisma.organization.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true },
      where: where as never,
    })) as SeedOrganization[];

    logger.log(
      `${args.dryRun ? 'DRY RUN' : 'LIVE'} evaluating ${organizations.length} organization(s)${args.env ? ` for ${args.env}` : ''}`,
    );

    let created = 0;
    let enabled = 0;
    let skipped = 0;
    let unchanged = 0;

    for (const organization of organizations) {
      if (!organization.userId) {
        logger.warn(
          `Skipping organization ${organization.id} — no owner userId`,
        );
        skipped += 1;
        continue;
      }

      const result = await ensureDailyTrendsDigestWorkflow({
        dryRun: args.dryRun,
        organizationId: organization.id,
        prisma,
        userId: organization.userId,
      });

      if (args.dryRun && result !== 'unchanged') {
        logger.log(
          `[DRY RUN] would ${result === 'enabled' ? 'enable' : 'create'} Daily Trends Digest workflow for org ${organization.id}`,
        );
      }

      if (result === 'created') {
        created += 1;
      } else if (result === 'enabled') {
        enabled += 1;
      } else {
        unchanged += 1;
      }
    }

    logger.log(
      `Trends digest seed summary: created=${created}, enabled=${enabled}, unchanged=${unchanged}, skipped=${skipped}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logger.error('Trends digest seed failed', error);
  process.exit(1);
});

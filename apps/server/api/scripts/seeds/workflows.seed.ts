/**
 * Seed Script: Default Recurring Workflows
 *
 * Provisions the default recurring workflow bundle for existing brands.
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --brandId=<id>
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --userId=<id>
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --env=production --live
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --all-clusters
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@genfeedai/prisma';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('WorkflowsSeed');
const SUPPORTED_CLUSTERS = ['local', 'staging', 'production'] as const;
const scriptDir = fileURLToPath(new URL('.', import.meta.url));

type SupportedCluster = (typeof SUPPORTED_CLUSTERS)[number];

type SeedArgs = {
  allClusters: boolean;
  brandId?: string;
  dryRun: boolean;
  env?: string;
  organizationId?: string;
  userId?: string;
};

type DefaultRecurringContentType = 'image' | 'newsletter' | 'post';

type SeedBrand = {
  agentConfig: unknown;
  id: string;
  label: string;
  organizationId: string;
  userId: string | null;
};

type ExistingWorkflow = {
  id: string;
  isScheduleEnabled: boolean | null;
  metadata: unknown;
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

const DEFAULT_RECURRING_SCHEDULE = '0 8 * * *';
const DEFAULT_RECURRING_TYPES: DefaultRecurringContentType[] = [
  'post',
  'newsletter',
  'image',
];

function parseArgs(): SeedArgs {
  const args = process.argv.slice(2);

  return {
    allClusters: args.includes('--all-clusters'),
    brandId: args.find((arg) => arg.startsWith('--brandId='))?.split('=')[1],
    dryRun: !args.includes('--live'),
    env: args.find((arg) => arg.startsWith('--env='))?.split('=')[1],
    organizationId: args
      .find((arg) => arg.startsWith('--organizationId='))
      ?.split('=')[1],
    userId: args.find((arg) => arg.startsWith('--userId='))?.split('=')[1],
  };
}

function getSpawnArgsForCluster(cluster: SupportedCluster): string[] {
  const forwardedArgs = process.argv.slice(2).filter((arg) => {
    return !arg.startsWith('--env=') && arg !== '--all-clusters';
  });

  return [process.argv[1]!, `--env=${cluster}`, ...forwardedArgs];
}

function runAllClusters(): void {
  const failures: string[] = [];

  for (const cluster of SUPPORTED_CLUSTERS) {
    logger.log(`Running workflow seed for cluster "${cluster}"`);

    const result = spawnSync(
      process.execPath,
      getSpawnArgsForCluster(cluster),
      {
        env: process.env,
        stdio: 'inherit',
      },
    );

    if (result.status !== 0) {
      failures.push(`${cluster}:${result.status ?? 'unknown'}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Workflow seed failed for ${failures.length} cluster(s): ${failures.join(', ')}`,
    );
  }
}

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

function parseOptionalId(value?: string): string | null {
  if (!value) {
    return null;
  }

  if (!OBJECT_ID_REGEX.test(value)) {
    throw new Error(`Invalid ObjectId: ${value}`);
  }

  return value;
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

function readWorkflowContentType(
  metadata: unknown,
): DefaultRecurringContentType | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const defaultRecurringContent = (
    metadata as { defaultRecurringContent?: unknown }
  ).defaultRecurringContent;
  if (!defaultRecurringContent || typeof defaultRecurringContent !== 'object') {
    return null;
  }
  const contentType = (defaultRecurringContent as { contentType?: unknown })
    .contentType;
  return contentType === 'post' ||
    contentType === 'newsletter' ||
    contentType === 'image'
    ? contentType
    : null;
}

function buildWorkflowLabel(
  brandLabel: string,
  contentType: DefaultRecurringContentType,
): string {
  switch (contentType) {
    case 'post':
      return `Daily posts for ${brandLabel}`;
    case 'newsletter':
      return `Daily newsletter for ${brandLabel}`;
    case 'image':
    default:
      return `Daily images for ${brandLabel}`;
  }
}

function buildWorkflowDescription(
  contentType: DefaultRecurringContentType,
  schedule: string,
  timezone: string,
): string {
  return [
    `Default recurring ${contentType} generation workflow`,
    `Schedule: ${schedule}`,
    `Timezone: ${timezone}`,
  ].join('\n');
}

function buildNodeLabel(contentType: DefaultRecurringContentType): string {
  switch (contentType) {
    case 'post':
      return 'Generate Post';
    case 'newsletter':
      return 'Generate Newsletter';
    case 'image':
    default:
      return 'Generate Image';
  }
}

function buildNodeType(contentType: DefaultRecurringContentType): string {
  switch (contentType) {
    case 'post':
      return 'ai-generate-post';
    case 'newsletter':
      return 'ai-generate-newsletter';
    case 'image':
    default:
      return 'ai-generate-image';
  }
}

function buildNodeConfig(params: {
  brandId: string;
  brandLabel: string;
  contentType: DefaultRecurringContentType;
  credentialId?: string;
  timezone: string;
}): Record<string, unknown> {
  const sharedConfig = {
    brandId: params.brandId,
    brandLabel: params.brandLabel,
    scheduleType: 'daily',
    timezone: params.timezone,
  };

  switch (params.contentType) {
    case 'post':
      return {
        ...sharedConfig,
        credentialId: params.credentialId,
        prompt: `Create one concise social media draft for ${params.brandLabel}. Keep it specific, on-brand, and ready for review.`,
      };
    case 'newsletter':
      return {
        ...sharedConfig,
        instructions: `Prepare the next review-ready newsletter draft for ${params.brandLabel}. Preserve continuity, avoid repetition, and keep the structure clear.`,
        prompt: `Create the next daily newsletter issue for ${params.brandLabel}.`,
      };
    case 'image':
    default:
      return {
        ...sharedConfig,
        model: 'genfeed-ai/flux2-dev',
        prompt: `Create a branded social image concept for ${params.brandLabel}.`,
        style: 'brand-campaign',
      };
  }
}

async function ensureDefaultBundle(params: {
  brand: SeedBrand;
  dryRun: boolean;
  prisma: PrismaClient;
  userId: string;
}): Promise<{
  changedTypes: DefaultRecurringContentType[];
  unchanged: boolean;
}> {
  const timezone =
    typeof (params.brand.agentConfig as { schedule?: { timezone?: unknown } })
      ?.schedule?.timezone === 'string'
      ? String(
          (params.brand.agentConfig as { schedule?: { timezone?: unknown } })
            .schedule?.timezone,
        ).trim() || 'UTC'
      : 'UTC';

  const existingWorkflows = (await params.prisma.workflow.findMany({
    select: {
      id: true,
      isScheduleEnabled: true,
      metadata: true,
    },
    where: {
      brands: { some: { id: params.brand.id } },
      isDeleted: false,
      organizationId: params.brand.organizationId,
    },
  })) as ExistingWorkflow[];

  const existingByType = new Map<
    DefaultRecurringContentType,
    ExistingWorkflow
  >();
  for (const workflow of existingWorkflows) {
    const contentType = readWorkflowContentType(workflow.metadata);
    if (contentType && !existingByType.has(contentType)) {
      existingByType.set(contentType, workflow);
    }
  }

  const changedTypes: DefaultRecurringContentType[] = [];

  for (const contentType of DEFAULT_RECURRING_TYPES) {
    const existing = existingByType.get(contentType);
    if (existing) {
      if (!existing.isScheduleEnabled) {
        changedTypes.push(contentType);
        if (!params.dryRun) {
          // Re-enable only flips the schedule flag, matching
          // DefaultRecurringContentService.ensureDefaultBundle. Never overwrite
          // schedule/timezone here: this runs as a production backfill over
          // existing rows, and an owner who customized then paused a workflow
          // must keep their customizations on re-enable.
          await params.prisma.workflow.update({
            data: {
              isScheduleEnabled: true,
            },
            where: { id: existing.id },
          });
        }
      }
      continue;
    }

    changedTypes.push(contentType);
    if (params.dryRun) {
      continue;
    }

    const credential =
      contentType === 'post'
        ? await params.prisma.credential.findFirst({
            select: { id: true },
            where: {
              brandId: params.brand.id,
              isConnected: true,
              isDeleted: false,
              organizationId: params.brand.organizationId,
            },
          })
        : null;

    await params.prisma.workflow.create({
      data: {
        brands: { connect: { id: params.brand.id } },
        description: buildWorkflowDescription(
          contentType,
          DEFAULT_RECURRING_SCHEDULE,
          timezone,
        ),
        edges: [],
        executionCount: 0,
        inputVariables: [],
        isDeleted: false,
        isScheduleEnabled: true,
        label: buildWorkflowLabel(params.brand.label, contentType),
        metadata: {
          createdFrom: 'system',
          defaultRecurringContent: {
            contentType,
            managedBy: 'system',
            origin: 'system',
            version: 1,
          },
          taskType: 'default-recurring-content',
        },
        nodes: [
          {
            data: {
              config: buildNodeConfig({
                brandId: params.brand.id,
                brandLabel: params.brand.label,
                contentType,
                credentialId: credential?.id,
                timezone,
              }),
              label: buildNodeLabel(contentType),
            },
            id: `generate-${contentType}`,
            position: { x: 120, y: 120 },
            type: buildNodeType(contentType),
          },
        ],
        organizationId: params.brand.organizationId,
        progress: 0,
        schedule: DEFAULT_RECURRING_SCHEDULE,
        status: 'active',
        steps: [],
        timezone,
        userId: params.userId,
      },
    });
  }

  return {
    changedTypes,
    unchanged: changedTypes.length === 0,
  };
}

async function main(): Promise<void> {
  loadEnvFile();

  const args = parseArgs();

  if (args.allClusters) {
    runAllClusters();
    return;
  }

  const prisma = createPrismaClient();

  try {
    const brandId = parseOptionalId(args.brandId);
    const organizationId = parseOptionalId(args.organizationId);

    const where: Record<string, unknown> = { isDeleted: false };
    if (brandId) {
      where.id = brandId;
    }
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const brands = (await prisma.brand.findMany({
      select: {
        agentConfig: true,
        id: true,
        label: true,
        organizationId: true,
        userId: true,
      },
      where: where as never,
      orderBy: { createdAt: 'asc' },
    })) as SeedBrand[];

    logger.log(
      `${args.dryRun ? 'DRY RUN' : 'LIVE'} evaluating ${brands.length} brand(s)${args.env ? ` for ${args.env}` : ''}`,
    );

    let created = 0;
    let skipped = 0;
    let unchanged = 0;

    for (const brand of brands) {
      const ownerUserId =
        args.userId ||
        ((brand as Record<string, unknown>).userId as string | undefined);
      if (!ownerUserId || !OBJECT_ID_REGEX.test(ownerUserId)) {
        logger.warn(
          `Skipping brand ${brand.id} (${(brand as Record<string, unknown>).label}) because no valid owner userId is available`,
        );
        skipped += 1;
        continue;
      }

      const result = await ensureDefaultBundle({
        brand,
        dryRun: args.dryRun,
        prisma,
        userId: ownerUserId,
      });

      if (result.unchanged) {
        logger.log(
          `Unchanged brand ${brand.id} (${brand.label}) - bundle already configured and enabled`,
        );
        unchanged += 1;
        continue;
      }

      if (args.dryRun) {
        logger.log(
          `[DRY RUN] would ensure ${result.changedTypes.join(', ')} workflows for brand ${brand.id} (${brand.label})`,
        );
        created += 1;
        continue;
      }

      logger.log(
        `Ensured ${result.changedTypes.join(', ')} workflows for brand ${brand.id} (${brand.label})`,
      );
      created += 1;
    }

    logger.log(
      `Workflow seed summary: updated=${created}, unchanged=${unchanged}, skipped=${skipped}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logger.error('Workflow seed failed', error);
  process.exit(1);
});

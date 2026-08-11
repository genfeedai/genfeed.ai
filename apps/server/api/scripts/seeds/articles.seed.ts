/**
 * Seed Script: Launch Articles
 *
 * Publishes the launch batch of public articles so genfeed.ai/articles is not
 * empty. The content was relocated out of `apps/docs` — docs.genfeed.ai stays
 * developer/product reference, prompting and growth tutorials live on the main
 * domain as articles.
 *
 * Idempotent: rows are matched on `(organizationId, slug)`. Re-running refreshes
 * label/summary/content/category and re-publishes anything that drifted, without
 * ever moving an existing `publishedAt`.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --userId=<id>
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --env=production --live
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --all-clusters
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isEntityId } from '@api-types/helpers/entity-id';
import { ArticleScope } from '@genfeedai/enums';
import { ArticleStatus, PrismaClient } from '@genfeedai/prisma';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { LAUNCH_ARTICLES } from './data/launch-articles';

const logger = new Logger('ArticlesSeed');
const SUPPORTED_CLUSTERS = ['local', 'staging', 'production'] as const;
const scriptDir = fileURLToPath(new URL('.', import.meta.url));

type SupportedCluster = (typeof SUPPORTED_CLUSTERS)[number];

type SeedArgs = {
  allClusters: boolean;
  dryRun: boolean;
  env?: string;
  organizationId?: string;
  userId?: string;
};

type SeedOwner = {
  organizationId: string;
  organizationLabel: string;
  userId: string;
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
    allClusters: args.includes('--all-clusters'),
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

  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error('Unable to resolve articles seed script path');
  }

  return [scriptPath, `--env=${cluster}`, ...forwardedArgs];
}

function runAllClusters(): void {
  const failures: string[] = [];

  for (const cluster of SUPPORTED_CLUSTERS) {
    logger.log(`Running articles seed for cluster "${cluster}"`);

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
      `Articles seed failed for ${failures.length} cluster(s): ${failures.join(', ')}`,
    );
  }
}

function parseOptionalId(value?: string): string | null {
  if (!value) {
    return null;
  }

  if (!isEntityId(value)) {
    throw new Error(`Invalid entity id: ${value}`);
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

/**
 * Articles require both an owning user and an organization. Without explicit
 * ids we publish under the oldest surviving organization and its owner, which
 * is the platform's own org in every deployment that has one.
 */
async function resolveOwner(params: {
  organizationId: string | null;
  prisma: PrismaClient;
  userId: string | null;
}): Promise<SeedOwner> {
  const organization = await params.prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, userId: true },
    where: params.organizationId
      ? { id: params.organizationId, isDeleted: false }
      : { isDeleted: false },
  });

  if (!organization) {
    throw new Error(
      params.organizationId
        ? `Organization ${params.organizationId} not found or deleted`
        : 'No organization found to own the seeded articles',
    );
  }

  const userId = params.userId || organization.userId;
  if (!userId) {
    throw new Error(
      `Organization ${organization.id} has no owner; pass --userId=<id>`,
    );
  }

  const user = await params.prisma.user.findFirst({
    select: { id: true },
    where: { id: userId },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  return {
    organizationId: organization.id,
    organizationLabel: organization.label,
    userId,
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
    const owner = await resolveOwner({
      organizationId: parseOptionalId(args.organizationId),
      prisma,
      userId: parseOptionalId(args.userId),
    });

    logger.log(
      `${args.dryRun ? 'DRY RUN' : 'LIVE'} publishing ${LAUNCH_ARTICLES.length} article(s) into ${owner.organizationLabel} (${owner.organizationId})${args.env ? ` for ${args.env}` : ''}`,
    );

    let created = 0;
    let updated = 0;
    const publishedAt = new Date();

    for (const article of LAUNCH_ARTICLES) {
      const existing = await prisma.article.findFirst({
        select: { id: true, publishedAt: true },
        where: {
          isDeleted: false,
          organizationId: owner.organizationId,
          slug: article.slug,
        },
      });

      if (existing) {
        if (args.dryRun) {
          logger.log(`[DRY RUN] would refresh article ${article.slug}`);
        } else {
          await prisma.article.update({
            data: {
              category: article.category,
              content: article.content,
              label: article.label,
              // Never move an existing publication date — only backfill one.
              publishedAt: existing.publishedAt ?? publishedAt,
              scope: ArticleScope.PUBLIC,
              status: ArticleStatus.PUBLISHED,
              summary: article.summary,
            },
            where: { id: existing.id },
          });
          logger.log(`Refreshed article ${article.slug}`);
        }
        updated += 1;
        continue;
      }

      if (args.dryRun) {
        logger.log(`[DRY RUN] would publish article ${article.slug}`);
        created += 1;
        continue;
      }

      await prisma.article.create({
        data: {
          category: article.category,
          content: article.content,
          isDeleted: false,
          label: article.label,
          organizationId: owner.organizationId,
          publishedAt,
          scope: ArticleScope.PUBLIC,
          slug: article.slug,
          status: ArticleStatus.PUBLISHED,
          summary: article.summary,
          userId: owner.userId,
        },
      });
      logger.log(`Published article ${article.slug}`);
      created += 1;
    }

    logger.log(
      `Articles seed summary: created=${created}, refreshed=${updated}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logger.error('Articles seed failed', error);
  process.exit(1);
});

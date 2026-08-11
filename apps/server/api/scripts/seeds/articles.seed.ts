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
import {
  buildIoRedisClientOptions,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
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

/**
 * Columns introduced by `20260811160000_rename_article_title_excerpt_to_label_summary`.
 * The seed writes `label`/`summary`, so a database still holding the pre-#2767
 * `title`/`excerpt` spelling rejects every insert with Postgres 42703.
 */
const REQUIRED_ARTICLE_COLUMNS = ['label', 'summary'] as const;

function isLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL;

  if (!url) {
    return false;
  }

  try {
    return ['0.0.0.0', '127.0.0.1', '::1', 'localhost'].includes(
      new URL(url).hostname,
    );
  } catch {
    return false;
  }
}

function runMigrateDeploy(): boolean {
  const prismaPackageDir = resolve(
    scriptDir,
    '..',
    '..',
    '..',
    '..',
    '..',
    'packages',
    'prisma',
  );

  const result = spawnSync('bunx', ['prisma', 'migrate', 'deploy'], {
    cwd: prismaPackageDir,
    env: process.env,
    stdio: 'inherit',
  });

  return result.status === 0;
}

/**
 * Fail — or self-heal — before the first write rather than part-way through it.
 *
 * A dry run issues no writes, so without this check it reports a clean
 * `created=8` against a database that cannot accept a single one of those rows;
 * the mismatch then surfaces only on the `--live` run, as a raw driver error
 * mid-loop. A dry run that cannot catch this is worse than no dry run, because
 * it manufactures confidence.
 *
 * Against a loopback database the fix is unambiguous and reversible, so apply it
 * directly. Against anything remote, migrations belong to the deploy pipeline —
 * report the exact command and stop.
 */
async function assertArticleSchemaReady(prisma: PrismaClient): Promise<void> {
  const findMissingColumns = async (): Promise<string[]> => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'articles'
        AND table_schema = current_schema()
    `;
    const present = new Set(rows.map((row) => row.column_name));

    return REQUIRED_ARTICLE_COLUMNS.filter((column) => !present.has(column));
  };

  const missing = await findMissingColumns();

  if (missing.length === 0) {
    return;
  }

  if (!isLocalDatabase()) {
    throw new Error(
      `articles is missing ${missing.join(', ')} — the target database has not applied ` +
        '20260811160000_rename_article_title_excerpt_to_label_summary. Migrations for ' +
        'non-local databases run through the deploy pipeline, not this seed. Merge the ' +
        'migration to master and let the deploy apply it, then re-run this seed.',
    );
  }

  logger.warn(
    `articles is missing ${missing.join(', ')}; applying pending migrations to the local database`,
  );

  if (!runMigrateDeploy()) {
    throw new Error(
      'prisma migrate deploy failed — resolve the migration state before seeding.',
    );
  }

  const stillMissing = await findMissingColumns();

  if (stillMissing.length > 0) {
    throw new Error(
      `articles is still missing ${stillMissing.join(', ')} after migrate deploy.`,
    );
  }

  logger.log('Local migrations applied; articles schema is ready');
}

/**
 * Tags on the public article endpoints (`@Cache({ tags: [...] })`), whose
 * responses this seed changes underneath the API.
 */
const PUBLIC_ARTICLE_CACHE_TAGS = ['articles', 'public'] as const;

/**
 * Writing rows with Prisma skips every service that would normally bust the
 * response cache, and `GET articles/slug/:slug` holds its payload for 30
 * minutes. Without this the seed reports success while the site keeps serving
 * the previous copy — the failure mode is invisible precisely because the
 * script says it worked.
 *
 * Mirrors `CacheTagsService.invalidateByTags`: read each `tag:{tag}` set, drop
 * the keys it names, then drop the set. Redis being unreachable is not a seed
 * failure — the rows are already written, and the cache expires on its own.
 */
async function invalidatePublicArticleCache(): Promise<void> {
  const connection = parseRedisConnectionForWorkload(
    { get: (key: string) => process.env[key] },
    RedisWorkload.CACHE,
  );
  const client = new Redis(
    buildIoRedisClientOptions(connection, { lazyConnect: true }),
  );

  try {
    await client.connect();

    let invalidated = 0;

    for (const tag of PUBLIC_ARTICLE_CACHE_TAGS) {
      const keys = await client.smembers(`tag:${tag}`);

      if (!keys.length) {
        continue;
      }

      const pipeline = client.multi();
      for (const key of keys) {
        pipeline.del(key);
      }
      pipeline.del(`tag:${tag}`);
      await pipeline.exec();

      invalidated += keys.length;
    }

    logger.log(`Invalidated ${invalidated} cached public article response(s)`);
  } catch (error: unknown) {
    logger.warn(
      `Could not invalidate the public article cache (${error instanceof Error ? error.message : String(error)}). ` +
        'Seeded content appears once the 30-minute response cache expires.',
    );
  } finally {
    client.disconnect();
  }
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
    await assertArticleSchemaReady(prisma);

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
              coverImageUrl: article.coverImageUrl,
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
          coverImageUrl: article.coverImageUrl,
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

    if (!args.dryRun && created + updated > 0) {
      await invalidatePublicArticleCache();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logger.error('Articles seed failed', error);
  process.exit(1);
});

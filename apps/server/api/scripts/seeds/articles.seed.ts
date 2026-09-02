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
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --organizationLabel=<label>
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --ownerEmail=<email>
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --userId=<id>
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --env=production --live --ownerEmail=<email>
 *   bun run apps/server/api/scripts/seeds/articles.seed.ts --all-clusters
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ArticleScope } from '@genfeedai/contracts';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import {
  ArticleStatus,
  getMissingArticleColumns,
  PrismaClient,
  REQUIRED_ARTICLE_COLUMNS,
} from '@genfeedai/prisma';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import {
  buildIoRedisClientOptions,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import {
  ORIGINAL_LAUNCH_BATCH_PUBLISHED_AT,
  RETIRED_ARTICLE_SLUGS,
} from './data/launch-articles';
import { SEO_ARTICLES } from './data/seo-articles';

const logger = new Logger('ArticlesSeed');
const SUPPORTED_CLUSTERS = ['local', 'staging', 'production'] as const;
const scriptDir = fileURLToPath(new URL('.', import.meta.url));

type SupportedCluster = (typeof SUPPORTED_CLUSTERS)[number];

type SeedArgs = {
  allClusters: boolean;
  brandId?: string;
  brandSlug?: string;
  dryRun: boolean;
  env?: string;
  organizationId?: string;
  organizationLabel?: string;
  ownerEmail?: string;
  userId?: string;
  validateRuntime: boolean;
};

type SeedOwner = {
  brandId: string;
  brandLabel: string;
  organizationId: string;
  organizationLabel: string;
  userId: string;
};

type OrganizationSelector = {
  id?: string;
  isDeleted: false;
  label?: string;
  userId?: string;
};

type BrandSelector = {
  id?: string;
  isActive: true;
  isDeleted: false;
  organizationId: string;
  slug?: string;
};

function loadEnvFile(envArg?: string): void {
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

export function parseArticlesSeedArgs(args: readonly string[]): SeedArgs {
  return {
    allClusters: args.includes('--all-clusters'),
    brandId: args.find((arg) => arg.startsWith('--brandId='))?.split('=')[1],
    brandSlug: args
      .find((arg) => arg.startsWith('--brandSlug='))
      ?.split('=')[1],
    dryRun: !args.includes('--live'),
    env: args.find((arg) => arg.startsWith('--env='))?.split('=')[1],
    organizationId: args
      .find((arg) => arg.startsWith('--organizationId='))
      ?.split('=')[1],
    organizationLabel: args
      .find((arg) => arg.startsWith('--organizationLabel='))
      ?.split('=')[1],
    ownerEmail: args
      .find((arg) => arg.startsWith('--ownerEmail='))
      ?.split('=')[1],
    userId: args.find((arg) => arg.startsWith('--userId='))?.split('=')[1],
    validateRuntime: args.includes('--validate-runtime'),
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

/**
 * TLS is resolved through the same factory `PrismaService` uses, rather than
 * handing the raw URL to the adapter. RDS Postgres forces SSL, and pg 8.22
 * now treats `sslmode=require` as `verify-full` — so a connection string that
 * works for the deployed API fails from a laptop, which has no bundled RDS CA
 * at `/certs/rds-ca.pem`. The factory reads `PRISMA_POSTGRES_CA_FILE` /
 * `PGSSLROOTCERT` when set, falls back to the bundled CA, and strips the
 * resolved params so pg never re-interprets them.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return new PrismaClient({
    adapter: new PrismaPg(
      createPrismaPgConfig(connectionString, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => process.env[key]),
      }),
    ),
  });
}

export function buildOrganizationSelector(
  organizationId: string | null,
  organizationLabel: string | null,
  ownerUserId: string | null,
): OrganizationSelector {
  return {
    ...(organizationId ? { id: organizationId } : {}),
    isDeleted: false,
    ...(organizationLabel ? { label: organizationLabel } : {}),
    ...(ownerUserId ? { userId: ownerUserId } : {}),
  };
}

export function buildBrandSelector(
  brandId: string | null,
  brandSlug: string | null,
  organizationId: string,
): BrandSelector {
  return {
    ...(brandId ? { id: brandId } : {}),
    isActive: true,
    isDeleted: false,
    organizationId,
    ...(brandSlug ? { slug: brandSlug } : {}),
  };
}

export function resolveSeedPublishedAt(params: {
  existingPublishedAt: Date | null;
  intendedPublishedAt: Date;
  migrateFrom?: Date;
}): Date {
  if (!params.existingPublishedAt) {
    return params.intendedPublishedAt;
  }

  if (
    params.migrateFrom &&
    params.existingPublishedAt.getTime() === params.migrateFrom.getTime()
  ) {
    return params.intendedPublishedAt;
  }

  return params.existingPublishedAt;
}

/**
 * Articles require both an owning user and an organization — `articles` carries
 * a non-nullable `organizationId`, and every tenant-scoped read filters on it,
 * so there is no such thing as an org-less article. The only question is which
 * org publishes them.
 *
 * `--ownerEmail=<email>` is the selector to reach for: it names the human who
 * owns the publishing org, which stays stable across environments where ids do
 * not. `--organizationId=` narrows further when that person owns several orgs.
 * With neither, we fall back to the oldest surviving organization — fine for a
 * fresh local database, and rejected outright for a live production run, where
 * "oldest" is whichever account happened to sign up first.
 */
async function resolveOwner(params: {
  brandId: string | null;
  brandSlug: string | null;
  organizationId: string | null;
  organizationLabel: string | null;
  ownerEmail: string | null;
  prisma: PrismaClient;
  userId: string | null;
}): Promise<SeedOwner> {
  const ownerByEmail = params.ownerEmail
    ? await params.prisma.user.findFirst({
        select: { id: true },
        where: { email: params.ownerEmail, isDeleted: false },
      })
    : null;

  if (params.ownerEmail && !ownerByEmail) {
    throw new Error(`No active user found for email ${params.ownerEmail}`);
  }

  const candidates = await params.prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, userId: true },
    where: params.organizationId
      ? buildOrganizationSelector(
          params.organizationId,
          params.organizationLabel,
          ownerByEmail?.id ?? null,
        )
      : ownerByEmail
        ? buildOrganizationSelector(
            null,
            params.organizationLabel,
            ownerByEmail.id,
          )
        : buildOrganizationSelector(null, params.organizationLabel, null),
  });

  const [organization] = candidates;

  // Picking the oldest of several organizations is a coin flip dressed up as a
  // default — and the loser is invisible, because the articles simply publish
  // somewhere the reader never looks. Name every candidate so the wrong one is
  // obvious in the log rather than discovered on a live site.
  if (params.organizationLabel && candidates.length > 1) {
    throw new Error(
      `Multiple organizations named ${params.organizationLabel} match the selected owner; pass --organizationId=<id>`,
    );
  }

  if (
    !params.organizationId &&
    !params.organizationLabel &&
    candidates.length > 1
  ) {
    logger.log(
      `${candidates.length} organizations match; using the oldest. Pass --organizationId=<id> to choose another:`,
    );
    for (const candidate of candidates) {
      logger.log(`  ${candidate.id}  ${candidate.label}`);
    }
  }

  if (!organization) {
    throw new Error(
      params.organizationId
        ? `Organization ${params.organizationId} not found or deleted`
        : params.ownerEmail
          ? params.organizationLabel
            ? `No organization named ${params.organizationLabel} owned by ${params.ownerEmail}`
            : `No organization owned by ${params.ownerEmail}`
          : 'No organization found to own the seeded articles',
    );
  }

  const userId = params.userId || ownerByEmail?.id || organization.userId;
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

  const brands = await params.prisma.brand.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, label: true },
    where: buildBrandSelector(
      params.brandId,
      params.brandSlug,
      organization.id,
    ),
  });
  const [brand] = brands;

  if (!brand) {
    const selector = params.brandId
      ? `id ${params.brandId}`
      : params.brandSlug
        ? `slug ${params.brandSlug}`
        : `organization ${organization.label}`;
    throw new Error(`No active brand found for ${selector}`);
  }

  if (!params.brandId && !params.brandSlug && brands.length > 1) {
    logger.log(
      `${brands.length} active brands match; using default/oldest ${brand.label} (${brand.id}). Pass --brandId=<id> or --brandSlug=<slug> to choose another.`,
    );
  }

  return {
    brandId: brand.id,
    brandLabel: brand.label,
    organizationId: organization.id,
    organizationLabel: organization.label,
    userId,
  };
}

export { getMissingArticleColumns, REQUIRED_ARTICLE_COLUMNS };

export function isLocalDatabaseUrl(databaseUrl?: string): boolean {
  if (!databaseUrl) {
    return false;
  }

  try {
    const hostname = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '');
    return ['0.0.0.0', '127.0.0.1', '::1', 'localhost'].includes(hostname);
  } catch {
    return false;
  }
}

function isLocalDatabase(): boolean {
  return isLocalDatabaseUrl(process.env.DATABASE_URL);
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
export async function assertArticleSchemaReady(params: {
  findPresentColumns: () => Promise<readonly string[]>;
  localDatabase: boolean;
  migrateDeploy: () => boolean;
}): Promise<void> {
  const missing = getMissingArticleColumns(await params.findPresentColumns());

  if (missing.length === 0) {
    return;
  }

  if (!params.localDatabase) {
    throw new Error(
      `articles is missing required seed column(s): ${missing.join(', ')}. ` +
        'The target database has not applied the current article schema migrations ' +
        '(including 20260811160000_rename_article_title_excerpt_to_label_summary for ' +
        'label/summary). Non-local migrations run through the deploy pipeline, not ' +
        'this seed. Let the deploy apply them, then re-run this seed.',
    );
  }

  logger.warn(
    `articles is missing ${missing.join(', ')}; applying pending migrations to the local database`,
  );

  if (!params.migrateDeploy()) {
    throw new Error(
      'prisma migrate deploy failed — resolve the migration state before seeding.',
    );
  }

  const stillMissing = getMissingArticleColumns(
    await params.findPresentColumns(),
  );

  if (stillMissing.length > 0) {
    throw new Error(
      `articles is still missing ${stillMissing.join(', ')} after migrate deploy.`,
    );
  }

  logger.log('Local migrations applied; articles schema is ready');
}

async function findPresentArticleColumns(
  prisma: PrismaClient,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'articles'
      AND table_schema = current_schema()
  `;

  return rows.map((row) => row.column_name);
}

/**
 * Tags on the public article endpoints (`@Cache({ tags: [...] })`), whose
 * responses this seed changes underneath the API.
 */
const PUBLIC_ARTICLE_CACHE_TAGS = ['articles', 'public'] as const;

type RedisPipelineResult = readonly [Error | null, unknown];

export function countDeletedCacheKeys(
  results: readonly RedisPipelineResult[] | null,
  keyCount: number,
): number {
  if (!results) {
    return 0;
  }

  return results
    .slice(0, keyCount)
    .filter(([error, result]) => !error && Number(result) > 0).length;
}

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
      const results = await pipeline.exec();
      const failedCommands = results
        ? results.filter(([error]) => Boolean(error)).length
        : keys.length + 1;

      invalidated += countDeletedCacheKeys(results, keys.length);

      if (failedCommands > 0) {
        logger.warn(
          `${failedCommands} cache deletion command(s) failed for tag ${tag}`,
        );
      }
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

/**
 * Reads the seeded rows back and reports exactly the columns the public list
 * endpoint filters on (`status`, `publishedAt`, `isDeleted`) plus the artwork
 * URL. A seed that reports success while the public feed stays empty is
 * otherwise indistinguishable from a seed that wrote to the wrong database —
 * this prints the evidence instead of leaving it to be guessed at.
 */
async function reportSeededRows(
  prisma: PrismaClient,
  owner: SeedOwner,
): Promise<void> {
  const rows = await prisma.article.findMany({
    orderBy: { slug: 'asc' },
    select: {
      coverImageUrl: true,
      brandId: true,
      isDeleted: true,
      publishedAt: true,
      scope: true,
      slug: true,
      status: true,
    },
    where: {
      organizationId: owner.organizationId,
      slug: {
        in: [
          ...SEO_ARTICLES.map((article) => article.slug),
          ...RETIRED_ARTICLE_SLUGS,
        ],
      },
    },
  });

  for (const row of rows) {
    logger.log(
      `row ${row.slug}: status=${row.status} scope=${row.scope} brandId=${row.brandId ?? 'MISSING'} publishedAt=${row.publishedAt?.toISOString() ?? 'null'} isDeleted=${row.isDeleted} artwork=${row.coverImageUrl ? 'set' : 'MISSING'}`,
    );
  }

  const publicCount = await prisma.article.count({
    where: {
      isDeleted: false,
      publishedAt: { lte: new Date() },
      status: ArticleStatus.PUBLISHED,
    },
  });
  logger.log(
    `Rows matching the public feed filter across all organizations: ${publicCount}`,
  );
}

/**
 * Names the database this run will write to — host, port, and database name
 * only, never the credentials. "The seed reported success but the public feed
 * is empty" has exactly two shapes: rows that fail the feed's filter, or rows
 * written somewhere the API never reads. `reportSeededRows` rules out the
 * first; this rules out the second, without anyone having to open an env file.
 */
function describeDatabaseTarget(): void {
  const url = process.env.DATABASE_URL;

  if (!url) {
    return;
  }

  try {
    const parsed = new URL(url);
    logger.log(
      `Target database: ${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`,
    );
  } catch {
    logger.log('Target database: DATABASE_URL is not a parseable URL');
  }
}

export async function runArticlesSeed(): Promise<void> {
  const args = parseArticlesSeedArgs(process.argv.slice(2));
  loadEnvFile(args.env);
  describeDatabaseTarget();

  if (args.validateRuntime) {
    logger.log(
      `Articles seed runtime ready (${SEO_ARTICLES.length} SEO articles bundled)`,
    );
    return;
  }

  if (args.allClusters) {
    runAllClusters();
    return;
  }

  // These articles are public marketing surface. Landing them in the wrong org
  // on production is not a cosmetic mistake — they become someone else's rows,
  // invisible to their intended owner and visible in a tenant that never asked
  // for them. Live production runs must name the owner.
  if (
    args.env === 'production' &&
    !args.dryRun &&
    !args.organizationId &&
    !args.ownerEmail
  ) {
    throw new Error(
      'A live production seed must name its owner: pass --ownerEmail=<email> or --organizationId=<id>',
    );
  }

  if (
    args.env === 'production' &&
    !args.dryRun &&
    !args.brandId &&
    !args.brandSlug
  ) {
    throw new Error(
      'A live production seed must name its review brand: pass --brandId=<id> or --brandSlug=<slug>',
    );
  }

  // `--env=production` only selects which env file to load; it says nothing
  // about where that file points. A checkout whose `.env.production` still
  // holds a localhost connection string will happily report "LIVE publishing
  // ... for production" while writing to the developer's own database — the
  // run looks like a successful deploy and the public feed never changes.
  // Refuse rather than let a local write masquerade as a production one.
  if (args.env === 'production' && !args.dryRun && isLocalDatabase()) {
    throw new Error(
      'Refusing a live production seed: DATABASE_URL points at a local database. Point .env.production at the production database, or drop --live to dry-run.',
    );
  }

  const prisma = createPrismaClient();

  try {
    await assertArticleSchemaReady({
      findPresentColumns: () => findPresentArticleColumns(prisma),
      localDatabase: isLocalDatabase(),
      migrateDeploy: runMigrateDeploy,
    });

    const owner = await resolveOwner({
      brandId: parseOptionalId(args.brandId),
      brandSlug: args.brandSlug ?? null,
      organizationId: parseOptionalId(args.organizationId),
      organizationLabel: args.organizationLabel ?? null,
      ownerEmail: args.ownerEmail ?? null,
      prisma,
      userId: parseOptionalId(args.userId),
    });

    logger.log(
      `${args.dryRun ? 'DRY RUN' : 'LIVE'} publishing ${SEO_ARTICLES.length} article(s) into ${owner.organizationLabel} / ${owner.brandLabel} (${owner.organizationId}/${owner.brandId})${args.env ? ` for ${args.env}` : ''}`,
    );

    let created = 0;
    let updated = 0;
    const originalLaunchBatchPublishedAt = new Date(
      ORIGINAL_LAUNCH_BATCH_PUBLISHED_AT,
    );

    for (const article of SEO_ARTICLES) {
      const existing = await prisma.article.findFirst({
        select: { brandId: true, id: true, publishedAt: true },
        where: {
          isDeleted: false,
          organizationId: owner.organizationId,
          slug: article.slug,
        },
      });

      if (existing) {
        const intendedPublishedAt = new Date(article.publishedAt);
        const publishedAt = resolveSeedPublishedAt({
          existingPublishedAt: existing.publishedAt,
          intendedPublishedAt,
          migrateFrom: originalLaunchBatchPublishedAt,
        });
        if (args.dryRun) {
          logger.log(
            `[DRY RUN] would refresh article ${article.slug} at ${publishedAt.toISOString()}${existing.brandId === owner.brandId ? '' : ` and assign brand ${owner.brandLabel}`}`,
          );
        } else {
          await prisma.article.update({
            data: {
              brandId: owner.brandId,
              category: article.category,
              content: article.content,
              coverImageUrl: article.coverImageUrl,
              label: article.label,
              publishedAt,
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
          brandId: owner.brandId,
          category: article.category,
          content: article.content,
          coverImageUrl: article.coverImageUrl,
          isDeleted: false,
          label: article.label,
          organizationId: owner.organizationId,
          publishedAt: new Date(article.publishedAt),
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

    for (const slug of RETIRED_ARTICLE_SLUGS) {
      const retired = await prisma.article.findFirst({
        select: { id: true, status: true },
        where: {
          isDeleted: false,
          organizationId: owner.organizationId,
          slug,
        },
      });

      if (!retired) {
        continue;
      }

      if (args.dryRun) {
        logger.log(`[DRY RUN] would archive retired article ${slug}`);
      } else if (retired.status !== ArticleStatus.ARCHIVED) {
        await prisma.article.update({
          data: { brandId: owner.brandId, status: ArticleStatus.ARCHIVED },
          where: { id: retired.id },
        });
        logger.log(`Archived retired article ${slug}`);
      }
    }

    logger.log(
      `Articles seed summary: created=${created}, refreshed=${updated}`,
    );

    if (!args.dryRun && created + updated > 0) {
      await invalidatePublicArticleCache();
    }

    await reportSeededRows(prisma, owner);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  runArticlesSeed().catch((error) => {
    logger.error('Articles seed failed', error);
    process.exit(1);
  });
}

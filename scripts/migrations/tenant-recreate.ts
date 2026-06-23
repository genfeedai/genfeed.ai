/**
 * Tenant Recreation Script
 *
 * Idempotently recreates the 17 source brands (and their organizations and
 * users) that exist in MongoDB but are missing from PostgreSQL after the
 * initial provisioning.
 *
 * Two tenants already exist in PG and must be REUSED (not duplicated):
 *   - Users matched by email:  vincent@genfeed.ai, vtellier72@gmail.com
 *   - Brand matched by slug:   genfeedai
 *
 * Dependency order: users → organizations → brands.
 * A single in-memory idMap carries Mongo ObjectId → PG cuid across all three
 * phases so FK references resolve correctly within a single run.
 *
 * Idempotency strategy:
 *   1. Before inserting, look up PG rows by natural key (email, slug).
 *   2. If found → REUSE existing PG row, register its id in the idMap.
 *   3. If not found → INSERT with mongoId set, then register in idMap.
 *   4. All inserts use `skipDuplicates: true` keyed on `mongoId` so re-runs
 *      are safe even if the script is interrupted mid-way.
 *
 * Output per slug: INSERTED | REUSED | FAILED.
 *
 * Usage:
 *   bun run scripts/migrations/tenant-recreate.ts                          # dry-run local
 *   bun run scripts/migrations/tenant-recreate.ts --env=production         # dry-run prod
 *   bun run scripts/migrations/tenant-recreate.ts --env=production --live  # live prod
 */

import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { type Document, MongoClient } from 'mongodb';
import { PrismaClient } from '../../packages/prisma/src/index';
import { normalizePgUrl } from './_pg-ssl';

const logger = new Logger('TenantRecreate');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envSuffix = envArg ?? 'local';
config({ path: resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`) });

const LEGACY_MONGODB_URI = process.env.LEGACY_MONGODB_URI;
if (!LEGACY_MONGODB_URI) {
  throw new Error(
    `LEGACY_MONGODB_URI is required (loaded from .env.${envSuffix})`,
  );
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(`DATABASE_URL is required (loaded from .env.${envSuffix})`);
}

const DRY_RUN = !process.argv.includes('--live');

if (DRY_RUN) {
  logger.log('[DRY RUN] No rows will be written. Pass --live to write.');
} else {
  logger.warn('[LIVE MODE] Rows WILL be written to PostgreSQL.');
}

// ---------------------------------------------------------------------------
// The 17 source brand slugs to recreate
// ---------------------------------------------------------------------------

const TARGET_BRAND_SLUGS: ReadonlySet<string> = new Set([
  'vincentonchain',
  'NoraNerrin',
  'shipshitdev',
  'koropompom',
  'SpinXXX',
  'vincentonai',
  'DegenThreadGuy',
  'boxingcouple',
  'mantella',
  'genfeedai',
  'itsshaylamonroe',
  'vtopiademo',
  'chan',
  'Wisenodedemo',
  'LinceFinancedemo',
  'surgeagency',
  'FUDNEWS',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RowResult {
  mongoId: string;
  naturalKey: string;
  status: 'INSERTED' | 'REUSED' | 'FAILED' | 'DRY_RUN';
  pgId: string | null;
  error?: string;
}

// mongoHex → PG cuid (shared across all phases in one run)
const idMap = new Map<string, string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toUpperSnake(value: string | undefined | null): string | null {
  if (!value) return null;
  return value.toUpperCase().replace(/-/g, '_');
}

function mongoHex(doc: Document): string {
  return (doc._id as { toString(): string }).toString();
}

function resolveMongoRef(doc: Document, field: string): string | null {
  const ref = doc[field] ?? doc[`${field}Id`];
  if (!ref) return null;
  const hex =
    typeof ref === 'string' ? ref : (ref as { toString(): string }).toString();
  return idMap.get(hex) ?? null;
}

// ---------------------------------------------------------------------------
// Prisma client
// ---------------------------------------------------------------------------

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: normalizePgUrl(DATABASE_URL!),
  });
  // biome-ignore lint/suspicious/noExplicitAny: PrismaClient ctor accepts adapter
  return new PrismaClient({ adapter } as any);
}

// biome-ignore lint/suspicious/noExplicitAny: dynamic prisma model access
type PrismaAny = any;

// ---------------------------------------------------------------------------
// Phase 1: Users
// ---------------------------------------------------------------------------

async function recreateUsers(
  mongoClient: MongoClient,
  prisma: PrismaAny,
  results: RowResult[],
): Promise<void> {
  logger.log('');
  logger.log('─'.repeat(60));
  logger.log('Phase 1: Users');
  logger.log('─'.repeat(60));

  // Collect the set of user Mongo IDs that own the target brands/orgs.
  // We load all users from auth.users and filter to those linked to target brands.
  const authDb = mongoClient.db('auth');
  const cloudDb = mongoClient.db('cloud');

  // First, find which organizations own target brands.
  const mongoBrands = await cloudDb
    .collection('brands')
    .find({ slug: { $in: [...TARGET_BRAND_SLUGS] } })
    .toArray();

  const orgMongoIds = new Set<string>(
    mongoBrands
      .map((b) => {
        const ref = b.organization ?? b.organizationId;
        return ref
          ? typeof ref === 'string'
            ? ref
            : (ref as { toString(): string }).toString()
          : null;
      })
      .filter((id): id is string => id !== null),
  );

  // Load all orgs and filter in-memory to those whose _id is in orgMongoIds.
  const mongoOrgsAll = await authDb
    .collection('organizations')
    .find({})
    .toArray();
  const relevantOrgHexes = new Set(orgMongoIds);
  const relevantUserHexes = new Set<string>();

  for (const org of mongoOrgsAll) {
    const orgHex = mongoHex(org);
    if (!relevantOrgHexes.has(orgHex)) continue;
    const userRef = org.user ?? org.userId;
    if (!userRef) continue;
    relevantUserHexes.add(
      typeof userRef === 'string'
        ? userRef
        : (userRef as { toString(): string }).toString(),
    );
  }

  const mongoUsers = await authDb.collection('users').find({}).toArray();

  const relevantUsers = mongoUsers.filter((u) =>
    relevantUserHexes.has(mongoHex(u)),
  );

  logger.log(`Found ${relevantUsers.length} relevant users in Mongo.`);

  for (const doc of relevantUsers) {
    const hex = mongoHex(doc);
    const email = (doc.email as string | undefined) ?? null;
    const result: RowResult = {
      mongoId: hex,
      naturalKey: email ?? `handle:${doc.handle}`,
      status: 'FAILED',
      pgId: null,
    };

    try {
      // Check if already exists in PG by email (natural key)
      let pgId: string | null = null;

      if (!DRY_RUN) {
        if (email) {
          const existing = await prisma.user.findFirst({
            where: { email },
            select: { id: true },
          });
          if (existing) {
            pgId = existing.id;
            result.status = 'REUSED';
            idMap.set(hex, pgId!); // pgId non-null at this point
            logger.log(`  REUSED user ${email} → ${pgId}`);
            results.push(result);
            result.pgId = pgId;
            continue;
          }
        }

        // Also check by mongoId (idempotent re-run)
        const existingByMongoId = await prisma.user.findFirst({
          where: { mongoId: hex },
          select: { id: true },
        });
        if (existingByMongoId) {
          pgId = existingByMongoId.id;
          result.status = 'REUSED';
          idMap.set(hex, pgId!); // pgId non-null at this point
          logger.log(`  REUSED user (mongoId) ${hex} → ${pgId}`);
          result.pgId = pgId;
          results.push(result);
          continue;
        }

        // Insert new user
        const newId = createId();
        await prisma.user.createMany({
          data: [
            {
              id: newId,
              mongoId: hex,
              authProviderId:
                (doc.authProviderId as string | undefined) ?? null,
              handle: (doc.handle as string) ?? `user_${hex.slice(-8)}`,
              firstName: (doc.firstName as string | undefined) ?? null,
              lastName: (doc.lastName as string | undefined) ?? null,
              email,
              avatar: (doc.avatar as string | undefined) ?? null,
              isDefault: (doc.isDefault as boolean | undefined) ?? false,
              isDeleted: (doc.isDeleted as boolean | undefined) ?? false,
              isInvited: (doc.isInvited as boolean | undefined) ?? false,
              isOnboardingCompleted:
                (doc.isOnboardingCompleted as boolean | undefined) ?? false,
              onboardingStartedAt:
                (doc.onboardingStartedAt as Date | undefined) ?? null,
              onboardingCompletedAt:
                (doc.onboardingCompletedAt as Date | undefined) ?? null,
              onboardingType: toUpperSnake(
                doc.onboardingType as string | undefined | null,
              ),
              onboardingStepsCompleted: Array.isArray(
                doc.onboardingStepsCompleted,
              )
                ? (doc.onboardingStepsCompleted as string[])
                : [],
              appSource:
                toUpperSnake(doc.appSource as string | undefined | null) ??
                'GENFEED',
              stripeCustomerId:
                (doc.stripeCustomerId as string | undefined) ?? null,
              createdAt: (doc.createdAt as Date | undefined) ?? new Date(),
              updatedAt: (doc.updatedAt as Date | undefined) ?? new Date(),
            },
          ],
          skipDuplicates: true,
        });

        pgId = newId;
        result.status = 'INSERTED';
        idMap.set(hex, pgId!); // pgId non-null at this point
        logger.log(`  INSERTED user ${email ?? doc.handle} → ${pgId}`);
      } else {
        // Dry-run: pre-check only
        if (email) {
          const existing = await prisma.user.findFirst({
            where: { email },
            select: { id: true },
          });
          if (existing) {
            pgId = existing.id;
            result.status = 'REUSED';
            idMap.set(hex, pgId!); // pgId non-null at this point
          } else {
            result.status = 'DRY_RUN';
            const dryId = `dry_${hex.slice(-8)}`;
            idMap.set(hex, dryId);
            pgId = dryId;
          }
        } else {
          result.status = 'DRY_RUN';
          const dryId = `dry_${hex.slice(-8)}`;
          idMap.set(hex, dryId);
          pgId = dryId;
        }
        logger.log(`  ${result.status} user ${email ?? doc.handle}`);
      }

      result.pgId = pgId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      logger.error(`  FAILED user ${hex}: ${msg}`);
    }

    results.push(result);
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Organizations
// ---------------------------------------------------------------------------

async function recreateOrganizations(
  mongoClient: MongoClient,
  prisma: PrismaAny,
  results: RowResult[],
): Promise<void> {
  logger.log('');
  logger.log('─'.repeat(60));
  logger.log('Phase 2: Organizations');
  logger.log('─'.repeat(60));

  const authDb = mongoClient.db('auth');
  const orgMongoIds = new Set<string>(
    [...idMap.entries()]
      // We need orgs linked to users we just processed — load all and filter.
      .map(([hex]) => hex),
  );

  // Load all orgs and filter to those whose user is in our idMap.
  const allOrgs = await authDb.collection('organizations').find({}).toArray();
  const relevantOrgs = allOrgs.filter((doc) => {
    const userRef = doc.user ?? doc.userId;
    if (!userRef) return false;
    const hex =
      typeof userRef === 'string'
        ? userRef
        : (userRef as { toString(): string }).toString();
    return idMap.has(hex);
  });

  logger.log(`Found ${relevantOrgs.length} relevant organizations in Mongo.`);

  for (const doc of relevantOrgs) {
    const hex = mongoHex(doc);
    const slug = (doc.slug as string | undefined) ?? null;
    const result: RowResult = {
      mongoId: hex,
      naturalKey: slug ?? hex,
      status: 'FAILED',
      pgId: null,
    };

    try {
      const userId = resolveMongoRef(doc, 'user');
      if (!userId) {
        result.error = 'Could not resolve userId from idMap';
        logger.warn(`  SKIPPED org ${slug}: userId unresolvable`);
        results.push(result);
        continue;
      }

      let pgId: string | null = null;

      if (!DRY_RUN) {
        // Check by mongoId first (idempotent re-run)
        const existingByMongoId = await prisma.organization.findFirst({
          where: { mongoId: hex },
          select: { id: true },
        });
        if (existingByMongoId) {
          pgId = existingByMongoId.id;
          result.status = 'REUSED';
          idMap.set(hex, pgId!); // pgId non-null at this point
          logger.log(`  REUSED org (mongoId) ${slug} → ${pgId}`);
          result.pgId = pgId;
          results.push(result);
          continue;
        }

        // Check by slug (natural key)
        if (slug) {
          const existingBySlug = await prisma.organization.findFirst({
            where: { slug },
            select: { id: true },
          });
          if (existingBySlug) {
            pgId = existingBySlug.id;
            result.status = 'REUSED';
            idMap.set(hex, pgId!); // pgId non-null at this point
            logger.log(`  REUSED org (slug) ${slug} → ${pgId}`);
            result.pgId = pgId;
            results.push(result);
            continue;
          }
        }

        const newId = createId();
        await prisma.organization.createMany({
          data: [
            {
              id: newId,
              mongoId: hex,
              userId,
              label: (doc.label as string | undefined) ?? slug ?? 'Untitled',
              slug: slug ?? `org_${hex.slice(-8)}`,
              prefix: (doc.prefix as string | undefined) ?? null,
              isSelected: (doc.isSelected as boolean | undefined) ?? false,
              isDefault: (doc.isDefault as boolean | undefined) ?? false,
              isDeleted: (doc.isDeleted as boolean | undefined) ?? false,
              category:
                toUpperSnake(doc.category as string | undefined | null) ??
                'BUSINESS',
              accountType:
                toUpperSnake(doc.accountType as string | undefined | null) ??
                null,
              onboardingCompleted:
                (doc.onboardingCompleted as boolean | undefined) ?? false,
              isProactiveOnboarding:
                (doc.isProactiveOnboarding as boolean | undefined) ?? false,
              proactiveWelcomeDismissed:
                (doc.proactiveWelcomeDismissed as boolean | undefined) ?? false,
              createdAt: (doc.createdAt as Date | undefined) ?? new Date(),
              updatedAt: (doc.updatedAt as Date | undefined) ?? new Date(),
            },
          ],
          skipDuplicates: true,
        });

        pgId = newId;
        result.status = 'INSERTED';
        idMap.set(hex, pgId!); // pgId non-null at this point
        logger.log(`  INSERTED org ${slug} → ${pgId}`);
      } else {
        const existingByMongoId = await prisma.organization.findFirst({
          where: { mongoId: hex },
          select: { id: true },
        });
        if (existingByMongoId) {
          pgId = existingByMongoId.id;
          result.status = 'REUSED';
          idMap.set(hex, pgId!); // pgId non-null at this point
        } else if (slug) {
          const existingBySlug = await prisma.organization.findFirst({
            where: { slug },
            select: { id: true },
          });
          if (existingBySlug) {
            pgId = existingBySlug.id;
            result.status = 'REUSED';
            idMap.set(hex, pgId!); // pgId non-null at this point
          } else {
            result.status = 'DRY_RUN';
            const dryId = `dry_${hex.slice(-8)}`;
            idMap.set(hex, dryId);
            pgId = dryId;
          }
        } else {
          result.status = 'DRY_RUN';
          const dryId = `dry_${hex.slice(-8)}`;
          idMap.set(hex, dryId);
          pgId = dryId;
        }
        logger.log(`  ${result.status} org ${slug}`);
      }

      result.pgId = pgId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      logger.error(`  FAILED org ${hex}: ${msg}`);
    }

    results.push(result);
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Brands
// ---------------------------------------------------------------------------

async function recreateBrands(
  mongoClient: MongoClient,
  prisma: PrismaAny,
  results: RowResult[],
): Promise<void> {
  logger.log('');
  logger.log('─'.repeat(60));
  logger.log('Phase 3: Brands');
  logger.log('─'.repeat(60));

  const cloudDb = mongoClient.db('cloud');
  const mongoBrands = await cloudDb
    .collection('brands')
    .find({ slug: { $in: [...TARGET_BRAND_SLUGS] } })
    .toArray();

  logger.log(`Found ${mongoBrands.length} target brands in Mongo.`);

  // Track which slugs were processed for the final report
  const processedSlugs = new Set<string>();

  for (const doc of mongoBrands) {
    const hex = mongoHex(doc);
    const slug = (doc.slug as string | undefined) ?? null;

    if (slug) processedSlugs.add(slug);

    const result: RowResult = {
      mongoId: hex,
      naturalKey: slug ?? hex,
      status: 'FAILED',
      pgId: null,
    };

    try {
      const organizationId = resolveMongoRef(doc, 'organization');
      const userId = resolveMongoRef(doc, 'user');

      if (!organizationId) {
        result.error = 'Could not resolve organizationId from idMap';
        logger.warn(
          `  SKIPPED brand ${slug}: organizationId unresolvable (org may not have been inserted)`,
        );
        results.push(result);
        continue;
      }

      let pgId: string | null = null;

      if (!DRY_RUN) {
        // Check by mongoId (idempotent re-run)
        const existingByMongoId = await prisma.brand.findFirst({
          where: { mongoId: hex },
          select: { id: true },
        });
        if (existingByMongoId) {
          pgId = existingByMongoId.id;
          result.status = 'REUSED';
          idMap.set(hex, pgId!); // pgId non-null at this point
          logger.log(`  REUSED brand (mongoId) ${slug} → ${pgId}`);
          result.pgId = pgId;
          results.push(result);
          continue;
        }

        // Check by slug (natural key — unique in PG)
        if (slug) {
          const existingBySlug = await prisma.brand.findFirst({
            where: { slug },
            select: { id: true },
          });
          if (existingBySlug) {
            pgId = existingBySlug.id;
            result.status = 'REUSED';
            idMap.set(hex, pgId!); // pgId non-null at this point
            logger.log(`  REUSED brand (slug) ${slug} → ${pgId}`);
            result.pgId = pgId;
            results.push(result);
            continue;
          }
        }

        const newId = createId();
        await prisma.brand.createMany({
          data: [
            {
              id: newId,
              mongoId: hex,
              userId,
              organizationId,
              slug: slug ?? `brand_${hex.slice(-8)}`,
              label: (doc.label as string | undefined) ?? slug ?? 'Untitled',
              description: (doc.description as string | undefined) ?? null,
              text: (doc.text as string | undefined) ?? null,
              fontFamily:
                toUpperSnake(doc.fontFamily as string | undefined | null) ??
                'MONTSERRAT_BLACK',
              primaryColor:
                (doc.primaryColor as string | undefined) ?? '#000000',
              secondaryColor:
                (doc.secondaryColor as string | undefined) ?? '#FFFFFF',
              backgroundColor:
                (doc.backgroundColor as string | undefined) ?? 'transparent',
              referenceImages: Array.isArray(doc.referenceImages)
                ? doc.referenceImages
                : [],
              isSelected: (doc.isSelected as boolean | undefined) ?? false,
              scope:
                toUpperSnake(doc.scope as string | undefined | null) ?? 'USER',
              isActive: (doc.isActive as boolean | undefined) ?? true,
              isDefault: (doc.isDefault as boolean | undefined) ?? false,
              isDeleted: (doc.isDeleted as boolean | undefined) ?? false,
              isHighlighted:
                (doc.isHighlighted as boolean | undefined) ?? false,
              isDarkroomEnabled:
                (doc.isDarkroomEnabled as boolean | undefined) ?? false,
              defaultVideoModel:
                (doc.defaultVideoModel as string | undefined) ?? null,
              defaultImageModel:
                (doc.defaultImageModel as string | undefined) ?? null,
              defaultImageToVideoModel:
                (doc.defaultImageToVideoModel as string | undefined) ?? null,
              defaultMusicModel:
                (doc.defaultMusicModel as string | undefined) ?? null,
              agentConfig:
                (doc.agentConfig as Record<string, unknown> | undefined) ?? {},
              createdAt: (doc.createdAt as Date | undefined) ?? new Date(),
              updatedAt: (doc.updatedAt as Date | undefined) ?? new Date(),
            },
          ],
          skipDuplicates: true,
        });

        pgId = newId;
        result.status = 'INSERTED';
        idMap.set(hex, pgId!); // pgId non-null at this point
        logger.log(`  INSERTED brand ${slug} → ${pgId}`);
      } else {
        // Dry-run lookups
        const existingByMongoId = await prisma.brand.findFirst({
          where: { mongoId: hex },
          select: { id: true },
        });
        if (existingByMongoId) {
          pgId = existingByMongoId.id;
          result.status = 'REUSED';
          idMap.set(hex, pgId!); // pgId non-null at this point
        } else if (slug) {
          const existingBySlug = await prisma.brand.findFirst({
            where: { slug },
            select: { id: true },
          });
          if (existingBySlug) {
            pgId = existingBySlug.id;
            result.status = 'REUSED';
            idMap.set(hex, pgId!); // pgId non-null at this point
          } else {
            result.status = 'DRY_RUN';
            pgId = null;
          }
        } else {
          result.status = 'DRY_RUN';
          pgId = null;
        }
        logger.log(`  ${result.status} brand ${slug}`);
      }

      result.pgId = pgId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      logger.error(`  FAILED brand ${hex}: ${msg}`);
    }

    results.push(result);
  }

  // Report slugs that had no Mongo match
  for (const slug of TARGET_BRAND_SLUGS) {
    if (!processedSlugs.has(slug)) {
      logger.warn(`  NOT FOUND in Mongo: brand slug "${slug}"`);
      results.push({
        mongoId: '',
        naturalKey: slug,
        status: 'FAILED',
        pgId: null,
        error: 'Not found in cloud.brands',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

function printSummary(label: string, results: RowResult[]): void {
  const col = { key: 32, status: 12, pgId: 28, error: 36 };
  const header = [
    'Natural Key'.padEnd(col.key),
    'Status'.padEnd(col.status),
    'PG ID'.padEnd(col.pgId),
    'Error',
  ].join(' │ ');
  const sep = '─'.repeat(header.length);

  logger.log('');
  logger.log(label);
  logger.log(sep);
  logger.log(header);
  logger.log(sep);

  for (const r of results) {
    logger.log(
      [
        r.naturalKey.slice(0, col.key).padEnd(col.key),
        r.status.padEnd(col.status),
        (r.pgId ?? '—').slice(0, col.pgId).padEnd(col.pgId),
        (r.error ?? '').slice(0, col.error),
      ].join(' │ '),
    );
  }

  logger.log(sep);

  const counts = {
    INSERTED: results.filter((r) => r.status === 'INSERTED').length,
    REUSED: results.filter((r) => r.status === 'REUSED').length,
    DRY_RUN: results.filter((r) => r.status === 'DRY_RUN').length,
    FAILED: results.filter((r) => r.status === 'FAILED').length,
  };

  logger.log(
    `Totals — INSERTED: ${counts.INSERTED}  REUSED: ${counts.REUSED}  ` +
      `DRY_RUN: ${counts.DRY_RUN}  FAILED: ${counts.FAILED}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.log('='.repeat(72));
  logger.log('Tenant Recreation');
  logger.log('='.repeat(72));
  logger.log(`Mode : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  logger.log(`Env  : ${envSuffix}`);
  logger.log(`Target brand slugs: ${[...TARGET_BRAND_SLUGS].join(', ')}`);
  logger.log('='.repeat(72));

  const mongoClient = new MongoClient(LEGACY_MONGODB_URI!);
  await mongoClient.connect();
  logger.log('Connected to MongoDB.');

  const prisma = createPrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.log('Connected to PostgreSQL.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`PostgreSQL connection failed: ${msg}`);
    await mongoClient.close();
    await (prisma as PrismaAny).$disconnect();
    process.exit(1);
  }

  const prismaAny = prisma as PrismaAny;

  const userResults: RowResult[] = [];
  const orgResults: RowResult[] = [];
  const brandResults: RowResult[] = [];

  await recreateUsers(mongoClient, prismaAny, userResults);
  await recreateOrganizations(mongoClient, prismaAny, orgResults);
  await recreateBrands(mongoClient, prismaAny, brandResults);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  printSummary('Users', userResults);
  printSummary('Organizations', orgResults);
  printSummary('Brands', brandResults);

  const allResults = [...userResults, ...orgResults, ...brandResults];
  const failedCount = allResults.filter((r) => r.status === 'FAILED').length;

  logger.log('');
  logger.log('='.repeat(72));
  logger.log(
    `Overall: ${allResults.length} rows processed. ${failedCount} FAILED.`,
  );
  if (DRY_RUN) {
    logger.log('[DRY RUN] No rows were written. Re-run with --live to apply.');
  }
  logger.log('='.repeat(72));

  await mongoClient.close();
  await prismaAny.$disconnect();

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});

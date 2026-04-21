/**
 * MongoDB Atlas → PostgreSQL (RDS) ETL Migration Script
 *
 * Migrates data from 7 MongoDB databases on the same Atlas cluster into
 * a single PostgreSQL database via Prisma. Collection-to-table mappings,
 * FK resolution, join tables, and back-fill logic are defined in the
 * companion `mongo-to-postgres-mapping.ts` file.
 *
 * Features:
 * - Phased migration (phase 1–3 for entities, phase 4 for back-fill / join tables)
 * - Batched inserts (1 000 docs per batch) via Prisma createMany
 * - MongoDB Object ID → CUID2 ID map for FK resolution
 * - Dry-run by default (pass --live to write)
 * - Enum validation in dry-run mode
 * - Target-table empty-check guard (pass --truncate to allow overwrite)
 * - Per-collection try/catch — continues on error, reports all failures at end
 * - Final summary table + enum validation report
 *
 * Prerequisites:
 * - LEGACY_MONGODB_URI in apps/server/api/.env.{local|production}
 * - DATABASE_URL in apps/server/api/.env.{local|production}
 *
 * Usage:
 *   bun run scripts/migrations/mongo-to-postgres.ts                           # dry-run local
 *   bun run scripts/migrations/mongo-to-postgres.ts --env=production          # dry-run production
 *   bun run scripts/migrations/mongo-to-postgres.ts --live                    # live local
 *   bun run scripts/migrations/mongo-to-postgres.ts --env=production --live   # live production
 *   bun run scripts/migrations/mongo-to-postgres.ts --collection=brands       # specific collection
 *   bun run scripts/migrations/mongo-to-postgres.ts --db=cloud                # specific MongoDB DB
 *   bun run scripts/migrations/mongo-to-postgres.ts --live --truncate         # truncate before insert
 */

import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { config } from 'dotenv';
import { type Document, MongoClient } from 'mongodb';

import {
  BACKFILL_MAPPINGS,
  type BackfillMapping,
  COLLECTION_MAPPINGS,
  type CollectionMapping,
  JOIN_TABLE_MAPPINGS,
  type JoinTableMapping,
  type MongoIdToCuidMap,
  resolveRef,
  SKIPPED_COLLECTIONS,
  toJsonSafe,
  toPostgresEnum,
} from './mongo-to-postgres-mapping';

const logger = new Logger('MongoToPostgres');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envSuffix = envArg || 'local';
config({ path: resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`) });

const LEGACY_MONGODB_URI = process.env.LEGACY_MONGODB_URI;
if (!LEGACY_MONGODB_URI) {
  throw new Error(
    `LEGACY_MONGODB_URI is required for this legacy migration (loaded from .env.${envSuffix})`,
  );
}

const DRY_RUN = !process.argv.includes('--live');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL && !DRY_RUN) {
  throw new Error(
    `DATABASE_URL is required for --live mode (loaded from .env.${envSuffix})`,
  );
}
const TRUNCATE = process.argv.includes('--truncate');
const AUTO_YES = process.argv.includes('--yes');
const BATCH_SIZE = 1000;

const collectionFilter = process.argv
  .find((a) => a.startsWith('--collection='))
  ?.split('=')[1];

const dbFilter = process.argv.find((a) => a.startsWith('--db='))?.split('=')[1];

// ---------------------------------------------------------------------------
// Known enum fields per MongoDB collection (for dry-run validation)
// ---------------------------------------------------------------------------

const ENUM_FIELDS: Record<string, string[]> = {
  'api-keys': ['category'],
  articles: ['status'],
  assets: ['category', 'parentType'],
  avatars: ['category', 'scope', 'status'],
  bookmarks: ['category', 'intent', 'platform'],
  bots: ['status'],
  brands: ['fontFamily', 'scope'],
  credentials: ['platform'],
  gifs: ['category', 'scope', 'status'],
  images: ['category', 'scope', 'status'],
  ingredients: [
    'assetLabel',
    'category',
    'cloneStatus',
    'contentRating',
    'qualityStatus',
    'reviewStatus',
    'scope',
    'status',
    'voiceProvider',
  ],
  links: ['category'],
  musics: ['category', 'scope', 'status'],
  'org-integrations': ['platform', 'status'],
  'organization-settings': ['agentReplyStyle', 'byokBillingStatus'],
  organizations: ['accountType', 'category'],
  'outreach-campaigns': ['status'],
  posts: ['category', 'platform', 'reviewDecision', 'status'],
  prompts: ['category', 'status'],
  settings: ['generationPriority', 'trendNotificationsFrequency'],
  speech: ['category', 'scope', 'status'],
  subscriptions: ['status'],
  tags: ['category'],
  tasks: ['priority', 'status'],
  trainings: ['stage'],
  users: ['appSource', 'onboardingType'],
  videos: ['category', 'scope', 'status'],
  'workflow-executions': ['status'],
  workflows: ['status'],
  leads: ['status'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigrationResult {
  pgTable: string;
  mongoDb: string;
  mongoCollection: string;
  sourceDocs: number;
  targetDocs: number;
  status: 'OK' | 'SKIPPED' | 'ERROR' | 'DRY_RUN';
  error?: string;
  enumIssues?: string[];
}

interface EnumValidationResult {
  collection: string;
  field: string;
  values: string[];
  unmapped: string[];
}

// ---------------------------------------------------------------------------
// ID Map
// ---------------------------------------------------------------------------

const idMap: MongoIdToCuidMap = new Map();

function registerMapping(
  pgTable: string,
  mongoHex: string,
  cuid: string,
): void {
  if (!idMap.has(pgTable)) {
    idMap.set(pgTable, new Map());
  }
  idMap.get(pgTable)!.set(mongoHex, cuid);
}

// ---------------------------------------------------------------------------
// Prisma client (lazy — only imported when --live is used)
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: Dynamic import for optional Prisma dep
type PrismaClientType = any;

async function createPrismaClient(): Promise<PrismaClientType> {
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import(
    '../../packages/prisma/generated/prisma/client/client'
  );
  const adapter = new PrismaPg({ connectionString: DATABASE_URL! });
  return new PrismaClient({ adapter });
}

// ---------------------------------------------------------------------------
// Confirmation prompt
// ---------------------------------------------------------------------------

async function confirm(message: string): Promise<boolean> {
  if (AUTO_YES) {
    logger.log(`${message} [y/N] → auto-confirmed (--yes)`);
    return true;
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Enum validation (dry-run)
// ---------------------------------------------------------------------------

async function validateEnums(
  mongoClient: MongoClient,
  mapping: CollectionMapping,
): Promise<EnumValidationResult[]> {
  const fields = ENUM_FIELDS[mapping.mongoCollection] ?? [];
  if (fields.length === 0) return [];

  const db = mongoClient.db(mapping.mongoDb);
  const results: EnumValidationResult[] = [];

  for (const field of fields) {
    try {
      const distinctValues = (await db
        .collection(mapping.mongoCollection)
        .distinct(field)) as string[];

      const validValues = distinctValues.filter(
        (v) => v !== null && v !== undefined && v !== '',
      );

      const unmapped: string[] = [];
      for (const val of validValues) {
        const mapped = toPostgresEnum(val);
        if (!mapped) {
          unmapped.push(val);
        }
      }

      results.push({
        collection: mapping.mongoCollection,
        field,
        unmapped,
        values: validValues.map(String),
      });
    } catch {
      // Field may not exist in all docs — non-fatal
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Dry-run: sample and transform
// ---------------------------------------------------------------------------

async function dryRunCollection(
  mongoClient: MongoClient,
  mapping: CollectionMapping,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    enumIssues: [],
    mongoCollection: mapping.mongoCollection,
    mongoDb: mapping.mongoDb,
    pgTable: mapping.pgTable,
    sourceDocs: 0,
    status: 'DRY_RUN',
    targetDocs: 0,
  };

  try {
    const db = mongoClient.db(mapping.mongoDb);
    const collections = await db
      .listCollections({ name: mapping.mongoCollection })
      .toArray();

    if (collections.length === 0) {
      logger.log(
        `  [SKIP] ${mapping.mongoDb}.${mapping.mongoCollection} — not found in source`,
      );
      result.status = 'SKIPPED';
      return result;
    }

    const sourceCount = await db
      .collection(mapping.mongoCollection)
      .countDocuments();
    result.sourceDocs = sourceCount;
    result.targetDocs = sourceCount; // optimistic for dry-run

    logger.log(
      `  ${mapping.mongoDb}.${mapping.mongoCollection} → ${mapping.pgTable}: ${sourceCount.toLocaleString()} docs`,
    );

    // Sample first 3 docs and show transformed output
    const sampleDocs = await db
      .collection(mapping.mongoCollection)
      .find({})
      .limit(3)
      .toArray();

    if (sampleDocs.length > 0) {
      logger.log(`    Sample transforms (first ${sampleDocs.length}):`);
      for (const doc of sampleDocs) {
        try {
          const transformed = mapping.transform(doc, idMap);
          logger.log(
            `      ${JSON.stringify(toJsonSafe(transformed), null, 0)}`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`      Transform error: ${msg}`);
        }
      }
    }

    // Enum validation
    const enumResults = await validateEnums(mongoClient, mapping);
    for (const er of enumResults) {
      const unmappedStr =
        er.unmapped.length > 0 ? ` UNMAPPED: [${er.unmapped.join(', ')}]` : '';
      logger.log(
        `    Enum ${er.field}: [${er.values.join(', ')}]${unmappedStr}`,
      );
      if (er.unmapped.length > 0) {
        result.enumIssues!.push(
          `${mapping.mongoCollection}.${er.field}: unmapped values [${er.unmapped.join(', ')}]`,
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`  ERROR in ${mapping.mongoCollection}: ${message}`);
    result.status = 'ERROR';
    result.error = message;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Live: migrate collection
// ---------------------------------------------------------------------------

async function migrateCollection(
  mongoClient: MongoClient,
  prisma: PrismaClientType,
  mapping: CollectionMapping,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    mongoCollection: mapping.mongoCollection,
    mongoDb: mapping.mongoDb,
    pgTable: mapping.pgTable,
    sourceDocs: 0,
    status: 'OK',
    targetDocs: 0,
  };

  try {
    const db = mongoClient.db(mapping.mongoDb);
    const collections = await db
      .listCollections({ name: mapping.mongoCollection })
      .toArray();

    if (collections.length === 0) {
      logger.log(
        `  [SKIP] ${mapping.mongoDb}.${mapping.mongoCollection} — not found in source`,
      );
      result.status = 'SKIPPED';
      return result;
    }

    const sourceCount = await db
      .collection(mapping.mongoCollection)
      .countDocuments();
    result.sourceDocs = sourceCount;

    logger.log(
      `  ${mapping.mongoDb}.${mapping.mongoCollection} → ${mapping.pgTable}: ${sourceCount.toLocaleString()} docs`,
    );

    if (sourceCount === 0) {
      logger.log(`    Empty collection — skipping`);
      return result;
    }

    // Guard: check if target table is empty
    if (!TRUNCATE) {
      const prismaModel = (
        prisma as unknown as Record<string, { count: () => Promise<number> }>
      )[mapping.prismaModel];
      if (prismaModel) {
        const existingCount = await prismaModel.count();
        if (existingCount > 0) {
          logger.warn(
            `    Target table "${mapping.pgTable}" already has ${existingCount} rows — skipping. Use --truncate to overwrite.`,
          );
          result.status = 'SKIPPED';
          result.targetDocs = existingCount;
          return result;
        }
      }
    }

    // Batched insert
    const cursor = db.collection(mapping.mongoCollection).find({});
    let batch: Document[] = [];
    let inserted = 0;
    const localIdBatch: Array<{ mongoHex: string; cuid: string }> = [];

    for await (const doc of cursor) {
      const mongoHex = (doc._id as { toHexString(): string }).toHexString();
      const cuid = createId();
      localIdBatch.push({ cuid, mongoHex });

      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        const transformed = batch
          .map((d, i) => {
            const { cuid, mongoHex } = localIdBatch[i];
            const row = mapping.transform(d, idMap);
            if (!row) return null;
            // Only register mapping for rows that pass the transform
            registerMapping(mapping.pgTable, mongoHex, cuid);
            return { id: cuid, ...row };
          })
          .filter(Boolean);

        const model = (
          prisma as unknown as Record<
            string,
            {
              createMany: (args: {
                data: unknown[];
                skipDuplicates: boolean;
              }) => Promise<{ count: number }>;
            }
          >
        )[mapping.prismaModel];
        if (model && transformed.length > 0) {
          const { count } = await model.createMany({
            data: transformed,
            skipDuplicates: true,
          });
          inserted += count;
        }

        batch = [];
        localIdBatch.length = 0;

        if (inserted % 10000 === 0) {
          logger.log(
            `    Inserted ${inserted.toLocaleString()}/${sourceCount.toLocaleString()}...`,
          );
        }
      }
    }

    // Flush remaining docs
    if (batch.length > 0) {
      const transformed = batch
        .map((d, i) => {
          const { cuid, mongoHex } = localIdBatch[i];
          const row = mapping.transform(d, idMap);
          if (!row) return null;
          registerMapping(mapping.pgTable, mongoHex, cuid);
          return { id: cuid, ...row };
        })
        .filter(Boolean);

      const model = (
        prisma as unknown as Record<
          string,
          {
            createMany: (args: {
              data: unknown[];
              skipDuplicates: boolean;
            }) => Promise<{ count: number }>;
          }
        >
      )[mapping.prismaModel];
      if (model && transformed.length > 0) {
        const { count } = await model.createMany({
          data: transformed,
          skipDuplicates: true,
        });
        inserted += count;
      }
    }

    logger.log(`    Inserted ${inserted.toLocaleString()} rows`);

    // Verify count
    const verifyModel = (
      prisma as unknown as Record<string, { count: () => Promise<number> }>
    )[mapping.prismaModel];
    if (verifyModel) {
      const targetCount = await verifyModel.count();
      result.targetDocs = targetCount;

      if (targetCount < result.sourceDocs) {
        logger.warn(
          `    Count mismatch: source=${result.sourceDocs}, target=${targetCount} (${result.sourceDocs - targetCount} skipped as duplicates)`,
        );
      } else {
        logger.log(`    Verified: ${targetCount.toLocaleString()} rows`);
      }
    } else {
      result.targetDocs = inserted;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`  ERROR in ${mapping.mongoCollection}: ${message}`);
    result.status = 'ERROR';
    result.error = message;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Phase 4: Back-fill FK columns
// ---------------------------------------------------------------------------

async function runBackfills(
  mongoClient: MongoClient,
  prisma: PrismaClientType,
  dryRun: boolean,
): Promise<void> {
  logger.log(`\n${'─'.repeat(70)}`);
  logger.log('Phase 4: Back-fill FK columns');
  logger.log('─'.repeat(70));

  for (const bf of BACKFILL_MAPPINGS) {
    logger.log(
      `  ${bf.pgTable}.${bf.fkColumn} ← ${bf.mongoDb}.${bf.mongoCollection}.${bf.mongoField} → idMap[${bf.refPgTable}]`,
    );

    if (dryRun) {
      logger.log(`    [DRY RUN] Would update FK references`);
      continue;
    }

    let updated = 0;
    let skipped = 0;

    // Read source docs that have the FK field set
    const db = mongoClient.db(bf.mongoDb);
    const cursor = db
      .collection(bf.mongoCollection)
      .find({ [bf.mongoField]: { $exists: true, $ne: null } });

    for await (const doc of cursor) {
      const ownerMongoHex = (
        doc._id as { toHexString(): string }
      ).toHexString();
      const refValue = doc[bf.mongoField];
      const refHex =
        typeof refValue === 'string'
          ? refValue
          : (refValue as { toString(): string }).toString();

      const refCuid = resolveRef(idMap, bf.refPgTable, refHex);
      if (!refCuid) {
        skipped++;
        continue;
      }

      try {
        const result = await prisma.$executeRawUnsafe(
          `UPDATE "${bf.pgTable}" SET "${bf.fkColumn}" = $1 WHERE "mongoId" = $2`,
          refCuid,
          ownerMongoHex,
        );
        updated += result;
      } catch {
        skipped++;
      }
    }

    logger.log(`    Updated ${updated} rows (${skipped} skipped/unresolved)`);
  }
}

// ---------------------------------------------------------------------------
// Phase 4: Join tables
// ---------------------------------------------------------------------------

async function runJoinTables(
  mongoClient: MongoClient,
  prisma: PrismaClientType,
  dryRun: boolean,
): Promise<void> {
  logger.log(`\n${'─'.repeat(70)}`);
  logger.log('Phase 4: Join tables');
  logger.log('─'.repeat(70));

  for (const jt of JOIN_TABLE_MAPPINGS) {
    logger.log(
      `  ${jt.mongoDb}.${jt.mongoCollection}.${jt.mongoField} → ${jt.joinTable}`,
    );

    if (dryRun) {
      logger.log(`    [DRY RUN] Would populate join table`);
      continue;
    }

    const db = mongoClient.db(jt.mongoDb);
    const cursor = db
      .collection(jt.mongoCollection)
      .find({ [jt.mongoField]: { $exists: true, $ne: [] } });

    let inserted = 0;
    let skipped = 0;

    for await (const doc of cursor) {
      const ownerMongoHex = (
        doc._id as { toHexString(): string }
      ).toHexString();
      const ownerCuid = resolveRef(idMap, jt.leftPgTable, ownerMongoHex);
      if (!ownerCuid) {
        skipped++;
        continue;
      }

      const refArray = (doc[jt.mongoField] as unknown[]) ?? [];
      const rows: Record<string, string>[] = [];

      for (const refId of refArray) {
        const refHex =
          typeof refId === 'object' && refId !== null
            ? (refId as { toHexString(): string }).toHexString()
            : String(refId);

        const refCuid = resolveRef(idMap, jt.rightPgTable, refHex);
        if (!refCuid) {
          skipped++;
          continue;
        }

        rows.push({
          [jt.leftColumn]: ownerCuid,
          [jt.rightColumn]: refCuid,
        });
      }

      if (rows.length === 0) continue;

      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${jt.joinTable}" ("${jt.leftColumn}", "${jt.rightColumn}") VALUES ${rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')} ON CONFLICT DO NOTHING`,
          ...rows.flatMap((r) => [r[jt.leftColumn], r[jt.rightColumn]]),
        );
        inserted += rows.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`    Insert error: ${msg}`);
        skipped++;
      }
    }

    logger.log(
      `    Inserted ${inserted} join rows (${skipped} skipped/unresolved)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Unmapped collection audit (dry-run)
// ---------------------------------------------------------------------------

async function auditUnmappedCollections(
  mongoClient: MongoClient,
): Promise<void> {
  // Collect all known MongoDB databases from mappings
  const dbNames = [...new Set(COLLECTION_MAPPINGS.map((m) => m.mongoDb))];

  for (const dbName of dbNames) {
    if (dbFilter && dbFilter !== dbName) continue;

    const db = mongoClient.db(dbName);
    const allCollections = await db.listCollections().toArray();
    const allNames = allCollections.map((c) => c.name);

    const mappedNames = COLLECTION_MAPPINGS.filter(
      (m) => m.mongoDb === dbName,
    ).map((m) => m.mongoCollection);

    const skippedNames = SKIPPED_COLLECTIONS.filter(
      (s) => s.mongoDb === dbName,
    ).map((s) => s.mongoCollection);

    const unmapped = allNames.filter(
      (n) => !mappedNames.includes(n) && !skippedNames.includes(n),
    );

    if (unmapped.length > 0) {
      logger.warn(`  [${dbName}] Unmapped collections: ${unmapped.join(', ')}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Truncate (live + --truncate)
// ---------------------------------------------------------------------------

async function truncateTables(prisma: PrismaClientType): Promise<void> {
  // Reverse phase order to respect FK constraints
  const tables = [...COLLECTION_MAPPINGS]
    .sort((a, b) => b.phase - a.phase)
    .map((m) => m.pgTable);

  logger.log(`\nTruncating ${tables.length} tables (CASCADE)...`);

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
      logger.log(`  Truncated: ${table}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`  Could not truncate "${table}": ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

function printSummary(
  results: MigrationResult[],
  allEnumIssues: string[],
): void {
  logger.log(`\n${'='.repeat(78)}`);
  logger.log('SUMMARY');
  logger.log('='.repeat(78));

  const col = { db: 14, src: 10, status: 10, tgt: 10, table: 28 };

  const header = [
    'Table'.padEnd(col.table),
    'Mongo DB'.padEnd(col.db),
    'Source'.padStart(col.src),
    'Target'.padStart(col.tgt),
    'Status'.padEnd(col.status),
  ].join(' │ ');

  const sep = '─'.repeat(header.length);

  logger.log(sep);
  logger.log(header);
  logger.log(sep);

  let totalSource = 0;
  let totalTarget = 0;

  for (const r of results) {
    const label = r.status === 'SKIPPED' ? `SKIPPED: ${r.pgTable}` : r.pgTable;

    logger.log(
      [
        label.padEnd(col.table),
        r.mongoDb.padEnd(col.db),
        r.sourceDocs.toLocaleString().padStart(col.src),
        (r.status === 'SKIPPED' ? '—' : r.targetDocs.toLocaleString()).padStart(
          col.tgt,
        ),
        r.status.padEnd(col.status),
      ].join(' │ '),
    );

    if (r.status !== 'SKIPPED') {
      totalSource += r.sourceDocs;
      totalTarget += r.targetDocs;
    }
  }

  logger.log(sep);

  const errCount = results.filter((r) => r.status === 'ERROR').length;

  logger.log(
    [
      'TOTAL'.padEnd(col.table),
      ''.padEnd(col.db),
      totalSource.toLocaleString().padStart(col.src),
      totalTarget.toLocaleString().padStart(col.tgt),
      (errCount === 0 ? 'OK' : `${errCount} ERROR(S)`).padEnd(col.status),
    ].join(' │ '),
  );

  logger.log(sep);

  // Enum issues
  if (allEnumIssues.length > 0) {
    logger.log(`\n${'='.repeat(78)}`);
    logger.log('ENUM VALIDATION ISSUES');
    logger.log('='.repeat(78));
    for (const issue of allEnumIssues) {
      logger.warn(`  ${issue}`);
    }
  }

  // Errors
  const errors = results.filter((r) => r.status === 'ERROR');
  if (errors.length > 0) {
    logger.log(`\n${'='.repeat(78)}`);
    logger.log('ERRORS');
    logger.log('='.repeat(78));
    for (const e of errors) {
      logger.error(
        `  ${e.mongoDb}.${e.mongoCollection} → ${e.pgTable}: ${e.error}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.log('='.repeat(78));
  logger.log('MongoDB Atlas → PostgreSQL ETL Migration');
  logger.log('='.repeat(78));
  logger.log(
    `Mode            : ${DRY_RUN ? 'DRY RUN (no writes to PostgreSQL)' : 'LIVE'}`,
  );
  logger.log(`Env             : ${envSuffix}`);
  logger.log(`Batch size      : ${BATCH_SIZE}`);
  if (collectionFilter) logger.log(`Collection filter: ${collectionFilter}`);
  if (dbFilter) logger.log(`DB filter       : ${dbFilter}`);
  if (TRUNCATE && !DRY_RUN) logger.log(`Truncate        : YES`);
  logger.log('='.repeat(78));

  if (DRY_RUN) {
    logger.log(
      '\n*** DRY RUN — reads MongoDB, writes NOTHING to PostgreSQL ***\n',
    );
  }

  // Filter mappings
  let mappings = COLLECTION_MAPPINGS;
  if (collectionFilter) {
    mappings = mappings.filter(
      (m) =>
        m.mongoCollection === collectionFilter ||
        m.pgTable === collectionFilter,
    );
  }
  if (dbFilter) {
    mappings = mappings.filter((m) => m.mongoDb === dbFilter);
  }

  if (mappings.length === 0) {
    logger.warn('No mappings matched the provided filters. Exiting.');
    process.exit(0);
  }

  // Connect to MongoDB (read-only usage)
  logger.log('Connecting to MongoDB Atlas...');
  const mongoClient = new MongoClient(LEGACY_MONGODB_URI, {
    // Connect once; switch databases via client.db(dbName)
  });
  await mongoClient.connect();
  logger.log('Connected to MongoDB Atlas\n');

  // Connect to PostgreSQL (only needed for live mode)
  // biome-ignore lint/suspicious/noExplicitAny: dynamic prisma client
  let prisma: any = null;
  if (!DRY_RUN) {
    logger.log('Connecting to PostgreSQL...');
    prisma = await createPrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.log('Connected to PostgreSQL\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`PostgreSQL connection failed: ${msg}`);
      await mongoClient.close();
      process.exit(1);
    }
  } else {
    logger.log('PostgreSQL: skipped (dry-run mode)\n');
  }

  // Confirmation guard for live runs
  if (!DRY_RUN) {
    const confirmed = await confirm(
      `\nAbout to write to PostgreSQL (${envSuffix}). Continue?`,
    );
    if (!confirmed) {
      logger.log('Aborted by user.');
      await mongoClient.close();
      await prisma.$disconnect();
      process.exit(0);
    }

    if (TRUNCATE) {
      const confirmTruncate = await confirm(
        `This will TRUNCATE all target tables. Are you sure?`,
      );
      if (!confirmTruncate) {
        logger.log('Truncate aborted by user.');
        await mongoClient.close();
        await prisma.$disconnect();
        process.exit(0);
      }
      await truncateTables(prisma);
    }
  }

  const allResults: MigrationResult[] = [];
  const allEnumIssues: string[] = [];
  const phases = [1, 2, 3] as const;

  // Phase 1–3: entity migrations
  for (const phase of phases) {
    const phaseMappings = mappings.filter((m) => m.phase === phase);
    if (phaseMappings.length === 0) continue;

    logger.log(`\n${'─'.repeat(70)}`);
    logger.log(`Phase ${phase} (${phaseMappings.length} collections)`);
    logger.log('─'.repeat(70));

    for (const mapping of phaseMappings) {
      let result: MigrationResult;

      if (DRY_RUN) {
        result = await dryRunCollection(mongoClient, mapping);
      } else {
        result = await migrateCollection(mongoClient, prisma, mapping);
      }

      allResults.push(result);

      if (result.enumIssues && result.enumIssues.length > 0) {
        allEnumIssues.push(...result.enumIssues);
      }
    }
  }

  // Phase 4: back-fills and join tables
  if (!collectionFilter && !dbFilter) {
    await runBackfills(mongoClient, prisma, DRY_RUN);
    await runJoinTables(mongoClient, prisma, DRY_RUN);
  }

  // Dry-run: audit unmapped collections
  if (DRY_RUN) {
    logger.log(`\n${'─'.repeat(70)}`);
    logger.log('Unmapped collection audit');
    logger.log('─'.repeat(70));
    await auditUnmappedCollections(mongoClient);
  }

  // Summary
  printSummary(allResults, allEnumIssues);

  // Cleanup
  await mongoClient.close();
  if (prisma) await prisma.$disconnect();

  logger.log(`\nMigration ${DRY_RUN ? 'dry run' : ''} complete.`);

  if (!DRY_RUN) {
    logger.log('\nMongoDB Atlas data was NOT modified (read-only).');
  }

  const hasErrors = allResults.some((r) => r.status === 'ERROR');
  const hasEnumIssues = allEnumIssues.length > 0;

  if (hasErrors || (DRY_RUN && hasEnumIssues)) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});

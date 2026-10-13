/**
 * Seed the Genfeed default style kit for brands that have no live Brand OS
 * revision and no voice of their own. Brands with their own voice are counted
 * and left alone: they start from their own fields on first use.
 *
 * Dry-run is the default. Pass `--live` to write. Brands are paged by stable id,
 * each write re-checks under the brand row lock that the brand still has no live
 * revision, and a re-run only touches brands that are still missing one.
 * Output carries counts only, never brand names or content.
 */

import process from 'node:process';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import {
  buildGenfeedDefaultKitDraft,
  hasOwnBrandVoice,
} from '@genfeedai/helpers';
import { Prisma, PrismaClient, toPrismaJson } from '@genfeedai/prisma';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('BrandDefaultKitBackfill');
const DEFAULT_BATCH_SIZE = 100;

export type BrandDefaultKitBackfillRow = {
  agentConfig?: unknown;
  description: string | null;
  id: string;
  label: string | null;
  organizationId: string;
};

export type BrandDefaultKitBackfillCounts = {
  brandsScanned: number;
  brandsWithOwnVoice: number;
  brandsSeeded: number;
  brandsSkippedConcurrent: number;
};

export function parseBrandDefaultKitBackfillArgs(args: readonly string[]): {
  batchSize: number;
  dryRun: boolean;
} {
  const batchArg = args
    .find((arg) => arg.startsWith('--batch='))
    ?.split('=')[1];
  const parsedBatch = batchArg ? Number.parseInt(batchArg, 10) : NaN;
  return {
    batchSize:
      Number.isFinite(parsedBatch) && parsedBatch > 0
        ? parsedBatch
        : DEFAULT_BATCH_SIZE,
    dryRun: !args.includes('--live'),
  };
}

export function buildBrandDefaultKitContent(
  row: BrandDefaultKitBackfillRow,
): IBrandKitDraft {
  return {
    ...buildGenfeedDefaultKitDraft({
      description: row.description,
      id: row.id,
      label: row.label,
      organization: row.organizationId,
    }),
    brandId: row.id,
    id: row.id,
    organizationId: row.organizationId,
  };
}

/** Seeds one brand under its row lock; false when it gained a revision meanwhile. */
async function seedBrand(
  prisma: PrismaClient,
  row: BrandDefaultKitBackfillRow,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${row.id} AND "organizationId" = ${row.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    const existing = await tx.brandOsRevision.count({
      where: {
        brandId: row.id,
        isDeleted: false,
        organizationId: row.organizationId,
      },
    });
    if (existing > 0) return false;
    const brand = await tx.brand.update({
      data: { brandOsRevisionVersion: { increment: 1 } },
      select: { brandOsRevisionVersion: true },
      where: {
        id: row.id,
        isDeleted: false,
        organizationId: row.organizationId,
      },
    });
    await tx.brandOsRevision.create({
      data: {
        brandId: row.id,
        content: toPrismaJson(buildBrandDefaultKitContent(row)),
        organizationId: row.organizationId,
        version: brand.brandOsRevisionVersion,
      },
    });
    return true;
  });
}

export async function backfillBrandDefaultKit(
  prisma: PrismaClient,
  options: { batchSize: number; dryRun: boolean },
): Promise<BrandDefaultKitBackfillCounts> {
  const counts: BrandDefaultKitBackfillCounts = {
    brandsScanned: 0,
    brandsSeeded: 0,
    brandsWithOwnVoice: 0,
    brandsSkippedConcurrent: 0,
  };
  let cursor = '';
  for (;;) {
    const rows = await prisma.$queryRaw<BrandDefaultKitBackfillRow[]>(
      Prisma.sql`
        SELECT b."id", b."organizationId", b."label", b."description", b."agentConfig"
        FROM "brands" b
        WHERE b."id" > ${cursor}
          AND b."isDeleted" = false
          AND NOT EXISTS (
            SELECT 1 FROM "brand_os_revisions" r
            WHERE r."brandId" = b."id"
              AND r."organizationId" = b."organizationId"
              AND r."isDeleted" = false
          )
        ORDER BY b."id" ASC
        LIMIT ${options.batchSize}
      `,
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      counts.brandsScanned += 1;
      // A brand with its own voice starts from its own fields on first use.
      if (hasOwnBrandVoice(row.agentConfig)) {
        counts.brandsWithOwnVoice += 1;
        continue;
      }
      if (options.dryRun) continue;
      if (await seedBrand(prisma, row)) counts.brandsSeeded += 1;
      else counts.brandsSkippedConcurrent += 1;
    }
    cursor = rows.at(-1)?.id ?? cursor;
  }
  return counts;
}

async function countBrandsWithoutRevision(
  prisma: PrismaClient,
): Promise<bigint> {
  const [remaining] = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "brands" b
      WHERE b."isDeleted" = false
        AND NOT EXISTS (
          SELECT 1 FROM "brand_os_revisions" r
          WHERE r."brandId" = b."id"
            AND r."organizationId" = b."organizationId"
            AND r."isDeleted" = false
        )
    `,
  );
  return remaining?.count ?? 0n;
}

async function main(): Promise<void> {
  const options = parseBrandDefaultKitBackfillArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run this backfill.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      createPrismaPgConfig(connectionString, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => process.env[key]),
      }),
    ),
    log: ['error'],
  });

  logger.log(
    `Starting brand default kit backfill (${options.dryRun ? 'DRY-RUN' : 'LIVE'}), batch size ${options.batchSize}`,
  );
  try {
    const counts = await backfillBrandDefaultKit(prisma, options);
    logger.log(
      `Backfill ${options.dryRun ? '(dry-run) ' : ''}complete: ${JSON.stringify(counts)}`,
    );
    if (options.dryRun) {
      logger.log('Re-run with --live to seed the brands listed above.');
      return;
    }
    const remaining = await countBrandsWithoutRevision(prisma);
    if (
      remaining > BigInt(counts.brandsWithOwnVoice) ||
      counts.brandsSkippedConcurrent > 0
    ) {
      throw new Error(
        `Backfill did not converge: ${remaining} brands still without a revision (${counts.brandsWithOwnVoice} keep their own voice), ${counts.brandsSkippedConcurrent} concurrent changes. Re-run safely.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    logger.error('Brand default kit backfill failed', error);
    process.exit(1);
  });
}

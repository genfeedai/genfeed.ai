/**
 * Reports saved IMAGE/VIDEO assets whose preview cannot render, and optionally
 * re-arms their stuck derivative variants.
 *
 * DRY-RUN BY DEFAULT: it only reads and prints aggregate counts and ids.
 * `--apply` resets FAILED and stale PENDING variants (attempt counter back to
 * zero, state PENDING) so the media-delivery recovery cron re-drives them on its
 * next tick. It never writes `s3Key`: key repair verifies the object in storage
 * first and is owned by the same cron (MediaKeyRepairService).
 *
 *   bun run scripts/media/repair-media-previews.ts [--organization <id>]
 *     [--limit <n>] [--sample <n>] [--apply]
 *
 * Needs DATABASE_URL. The report never prints keys, URLs or credentials.
 */
import { prisma } from '@genfeedai/prisma/client';
import { parseArgs, type RepairOptions } from './repair-media-previews.args';

const MEDIA_CATEGORIES = ['IMAGE', 'IMAGE_EDIT', 'VIDEO', 'VIDEO_EDIT'];
const STALE_PENDING_MS = 60 * 60 * 1000;

function scope(options: RepairOptions) {
  return options.organizationId
    ? { organizationId: options.organizationId }
    : {};
}

async function countBrokenKeys(options: RepairOptions) {
  const where = {
    ...scope(options),
    category: { in: MEDIA_CATEGORIES },
    isDeleted: false,
    OR: [
      { s3Key: null },
      { s3Key: '' },
      { s3Key: { mode: 'insensitive', startsWith: 'http' } },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.ingredient.count({ where }),
    prisma.ingredient.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      take: options.sample,
      where,
    }),
  ]);
  return { sampleIds: rows.map((row) => row.id), total };
}

function variantWhere(options: RepairOptions) {
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
  return {
    ...scope(options),
    isDeleted: false,
    OR: [
      { state: 'FAILED' },
      { state: 'PENDING', updatedAt: { lt: staleBefore } },
    ],
  };
}

async function countVariantsByState(options: RepairOptions) {
  const groups = await prisma.mediaDeliveryVariant.groupBy({
    _count: { _all: true },
    by: ['state', 'failureCode'],
    where: { ...scope(options), isDeleted: false },
  });
  return groups.map((group) => ({
    count: group._count._all,
    failureCode: group.failureCode,
    state: group.state,
  }));
}

async function rearmVariants(options: RepairOptions): Promise<number> {
  const rows = await prisma.mediaDeliveryVariant.findMany({
    orderBy: { updatedAt: 'asc' },
    select: { id: true },
    take: options.limit,
    where: variantWhere(options),
  });
  if (rows.length === 0) {
    return 0;
  }
  const result = await prisma.mediaDeliveryVariant.updateMany({
    // `updatedAt` is set explicitly: Prisma would otherwise refresh it and the
    // recovery cron would wait for the stale-PENDING window before it acts.
    data: {
      attemptCount: 0,
      failureCode: null,
      state: 'PENDING',
      updatedAt: new Date(Date.now() - STALE_PENDING_MS),
    },
    where: { ...variantWhere(options), id: { in: rows.map((row) => row.id) } },
  });
  return result.count;
}

export async function run(options: RepairOptions) {
  const brokenKeys = await countBrokenKeys(options);
  const variants = await countVariantsByState(options);
  const stuck = await prisma.mediaDeliveryVariant.count({
    where: variantWhere(options),
  });
  const rearmed = options.isApply ? await rearmVariants(options) : 0;
  return {
    brokenKeys,
    mode: options.isApply ? 'apply' : 'dry-run',
    organizationId: options.organizationId,
    rearmedVariants: rearmed,
    stuckVariants: stuck,
    variants,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await run(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!options.isApply) {
    process.stdout.write('Dry run: pass --apply to re-arm stuck variants.\n');
  }
  await prisma.$disconnect();
}

if (import.meta.main) {
  main().catch(async (error: unknown) => {
    process.stderr.write(
      `repair-media-previews failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
}

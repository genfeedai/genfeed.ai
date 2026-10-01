import { randomUUID } from 'node:crypto';
import { RUN_SELECT } from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  storyboardLegacyConfigSchema,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-run-migration';
import { applyStoryboardRunMigration } from '@api/collections/content-runs/services/storyboard-run-migration-store';
import { type Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Storyboard migration CAS against real PostgreSQL', () => {
  let prisma: PrismaClient;
  const prefix = `5724-${randomUUID()}`;
  const userId = `${prefix}-user`;
  const organizationId = `${prefix}-org`;
  const brandId = `${prefix}-brand`;
  const context = {
    organizationId,
    brandId,
    migratedAt: '2026-09-30T14:00:00.000Z',
    authorizedAssetIds: new Set<string>(),
  };
  beforeAll(async () => {
    const url =
      process.env.STORYBOARD_DISPOSABLE_DATABASE_URL ??
      process.env.DATABASE_URL;
    const database = url ? new URL(url) : null;
    if (
      !url ||
      !database ||
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      !(
        database.pathname.startsWith('/storyboard_5724_disposable') ||
        (process.env.CI === 'true' && database.pathname === '/test')
      )
    )
      throw new Error('Requires a disposable local Storyboard test database');
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    await prisma.user.create({ data: { id: userId, handle: userId } });
    await prisma.organization.create({
      data: {
        id: organizationId,
        userId,
        label: 'Fixture org',
        slug: organizationId,
      },
    });
    await prisma.brand.create({
      data: {
        id: brandId,
        userId,
        organizationId,
        label: 'Fixture brand',
        slug: brandId,
      },
    });
  });
  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.contentRun.deleteMany({
        where: { organizationId, brandId },
      });
      await prisma.brand.deleteMany({ where: { organizationId, id: brandId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });
  async function fixture() {
    const config = storyboardLegacyConfigSchema.parse({
      contract: 'brand-remix-run',
      version: 1,
      recipeVersion: 1,
      revision: 4,
      phase: 'generating',
      readiness: { state: 'ready', issues: [] },
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: { objective: 'A product' },
        output: {
          kind: 'video',
          aspectRatio: '9:16',
          count: 1,
          durationSeconds: 12,
        },
        references: [],
        reviewRequired: true,
        target: { kind: 'organic', platform: 'tiktok' },
      },
      sourceSnapshot: {
        capturedAt: '2026-09-30T12:00:00.000Z',
        title: 'A product',
        sourceId: 'source-1',
        platform: 'tiktok',
        selector: { kind: 'source_post', sourcePostId: 'source-1' },
        metrics: {},
        pattern: {},
        evidence: [],
      },
      concept: {
        savedAt: '2026-09-30T12:00:00.000Z',
        storyboard: [
          {
            id: 'scene-1',
            ordinal: 1,
            visualIntent: 'Show',
            durationSeconds: 6,
          },
          {
            id: 'scene-2',
            ordinal: 2,
            visualIntent: 'End',
            durationSeconds: 6,
          },
        ],
      },
      scenePipeline: {
        version: 1,
        language: 'en',
        state: 'generating',
        cancellationGeneration: 2,
        replacedAssetIds: [],
        operation: {
          id: 'original-operation',
          quoteId: 'original-quote',
          revision: 3,
          cancellationGeneration: 1,
          startedAt: '2026-09-30T12:00:00.000Z',
          userId,
          sequence: 7,
        },
        scenes: {},
        receipts: [
          {
            key: 'original-line',
            operationId: 'original-operation',
            reservationId: 'original-reservation',
            actorUserId: userId,
            amount: 3,
            billingMode: 'platform',
            state: 'reserved',
          },
        ],
      },
    });
    const row = await prisma.contentRun.create({
      data: {
        id: `${prefix}-${randomUUID()}`,
        organizationId,
        brandId,
        config: config as unknown as Prisma.InputJsonValue,
      },
      select: RUN_SELECT,
    });
    const record = { ...row, organizationId, brandId };
    const cutover = {
      legacyProducersStopped: true as const,
      workerAdmissionDrained: true as const,
      runId: record.id,
      originalConfigHash: storyboardConfigHash(record.config),
    };
    return { record, cutover, config };
  }
  it('commits one migration and one recovery sequence from two competing snapshots', async () => {
    const { record, cutover, config } = await fixture();
    const outcomes = await Promise.all([
      applyStoryboardRunMigration(prisma as never, record, context, {
        dryRun: false,
        cutover,
      }),
      applyStoryboardRunMigration(prisma as never, record, context, {
        dryRun: false,
        cutover,
      }),
    ]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual([
      'applied',
      'conflict',
    ]);
    const row = await prisma.contentRun.findUniqueOrThrow({
      where: { id: record.id },
    });
    const stored = storyboardStoredRunConfigSchema.parse(row.config);
    expect(stored.revision).toBe(4);
    expect(stored.importedState?.originalConfig).toEqual(config);
    expect(
      stored.importedState?.activeConfig?.scenePipeline?.operation,
    ).toMatchObject({
      id: 'original-operation',
      quoteId: 'original-quote',
      revision: 3,
      sequence: 8,
    });
    expect(stored.importedState?.activeConfig?.scenePipeline?.receipts).toEqual(
      config.scenePipeline?.receipts,
    );
    expect(stored.migrationRecovery).toEqual({
      operationId: 'original-operation',
      previousSequence: 7,
      nextSequence: 8,
      jobId: `storyboard-${record.id}-original-operation-8`,
      state: 'pending',
    });
    expect(
      (
        await applyStoryboardRunMigration(
          prisma as never,
          { ...record, config: row.config, updatedAt: row.updatedAt },
          context,
          { dryRun: false },
        )
      ).status,
    ).toBe('unchanged');
  });
  it('does not overwrite an editorial save made after the migration snapshot', async () => {
    const { record, cutover, config } = await fixture();
    const edited = structuredClone(config);
    edited.revision = 5;
    edited.draft.intent.objective = 'New editorial intent';
    await prisma.contentRun.update({
      where: { id: record.id },
      data: { config: edited as unknown as Prisma.InputJsonValue },
    });
    expect(
      (
        await applyStoryboardRunMigration(prisma as never, record, context, {
          dryRun: false,
          cutover,
        })
      ).status,
    ).toBe('conflict');
    expect(
      (await prisma.contentRun.findUniqueOrThrow({ where: { id: record.id } }))
        .config,
    ).toEqual(edited);
  });
  it('keeps dry-run and missing-cutover checks free of database writes', async () => {
    const { record } = await fixture();
    expect(
      (
        await applyStoryboardRunMigration(prisma as never, record, context, {
          dryRun: true,
        })
      ).status,
    ).toBe('dry_run');
    await expect(
      applyStoryboardRunMigration(prisma as never, record, context, {
        dryRun: false,
      }),
    ).rejects.toThrow('STORYBOARD_MIGRATION_CUTOVER_REQUIRED');
    const after = await prisma.contentRun.findUniqueOrThrow({
      where: { id: record.id },
      select: RUN_SELECT,
    });
    expect(after).toEqual(record);
  });
  it('rejects a foreign tenant and refuses a row soft-deleted after its snapshot', async () => {
    const { record, cutover } = await fixture();
    expect(
      (
        await applyStoryboardRunMigration(
          prisma as never,
          record,
          { ...context, organizationId: 'other-org' },
          { dryRun: false, cutover },
        )
      ).status,
    ).toBe('unsupported');
    await prisma.contentRun.update({
      where: { id: record.id },
      data: { isDeleted: true },
    });
    expect(
      (
        await applyStoryboardRunMigration(prisma as never, record, context, {
          dryRun: false,
          cutover,
        })
      ).status,
    ).toBe('conflict');
    const after = await prisma.contentRun.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(after.config).toEqual(record.config);
    expect(after.isDeleted).toBe(true);
  });
});

import {
  storyboardLegacyConfigSchema,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-run-migration';
import { applyStoryboardRunMigration } from '@api/collections/content-runs/services/storyboard-run-migration-store';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
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
        { id: 'scene-1', ordinal: 1, visualIntent: 'Show', durationSeconds: 6 },
        { id: 'scene-2', ordinal: 2, visualIntent: 'End', durationSeconds: 6 },
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
        userId: 'user-1',
        sequence: 7,
      },
      scenes: {},
      receipts: [
        {
          key: 'original-line',
          operationId: 'original-operation',
          reservationId: 'original-reservation',
          actorUserId: 'user-1',
          amount: 3,
          billingMode: 'platform',
          state: 'reserved',
        },
      ],
    },
  });
  const record = {
    id: 'run-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    isDeleted: false,
    updatedAt: new Date('2026-09-30T12:00:00.000Z'),
    config,
  };
  const context = {
    organizationId: 'org-1',
    brandId: 'brand-1',
    migratedAt: '2026-09-30T14:00:00.000Z',
    authorizedAssetIds: new Set<string>(),
  };
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const client = { contentRun: { updateMany } };
  const cutover = {
    legacyProducersStopped: true as const,
    workerAdmissionDrained: true as const,
    runId: record.id,
    originalConfigHash: storyboardConfigHash(config),
  };
  return { record, context, updateMany, client, cutover };
}
describe('Storyboard migration CAS and recovery outbox', () => {
  it('dry runs never write or advance a stored sequence', async () => {
    const { client, record, context, updateMany } = fixture();
    const result = await applyStoryboardRunMigration(
      client as never,
      record,
      context,
      { dryRun: true },
    );
    expect(result.status).toBe('dry_run');
    expect(updateMany).not.toHaveBeenCalled();
    expect(record.config.scenePipeline?.operation?.sequence).toBe(7);
  });
  it('requires an exact drained cutover proof before any write', async () => {
    const { client, record, context, updateMany } = fixture();
    await expect(
      applyStoryboardRunMigration(client as never, record, context, {
        dryRun: false,
      }),
    ).rejects.toThrow('STORYBOARD_MIGRATION_CUTOVER_REQUIRED');
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('atomically records one neutral recovery sequence and preserves original operation/receipt/cancellation identities', async () => {
    const { client, record, context, updateMany, cutover } = fixture();
    const result = await applyStoryboardRunMigration(
      client as never,
      record,
      context,
      { dryRun: false, cutover },
    );
    const migrated = storyboardStoredRunConfigSchema.parse(
      result.conversion.config,
    );
    expect(migrated.migrationRecovery).toEqual({
      operationId: 'original-operation',
      previousSequence: 7,
      nextSequence: 8,
      jobId: 'storyboard-run-1-original-operation-8',
      state: 'pending',
    });
    expect(migrated.importedState?.originalConfig.scenePipeline).toEqual(
      record.config.scenePipeline,
    );
    expect(
      migrated.importedState?.activeConfig?.scenePipeline?.operation,
    ).toEqual({ ...record.config.scenePipeline?.operation, sequence: 8 });
    expect(
      migrated.importedState?.activeConfig?.scenePipeline?.receipts,
    ).toEqual(record.config.scenePipeline?.receipts);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          brandId: 'brand-1',
          id: 'run-1',
          isDeleted: false,
          updatedAt: record.updatedAt,
          AND: [
            { config: { equals: record.config } },
            { config: { path: ['revision'], equals: 4 } },
          ],
        }),
      }),
    );
    const retry = await applyStoryboardRunMigration(
      client as never,
      { ...record, config: result.conversion.config },
      context,
      { dryRun: false },
    );
    expect(retry.status).toBe('unchanged');
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
  it('reports a CAS conflict without overwriting a concurrent creative edit', async () => {
    const { client, record, context, updateMany, cutover } = fixture();
    updateMany.mockResolvedValue({ count: 0 });
    expect(
      (
        await applyStoryboardRunMigration(client as never, record, context, {
          dryRun: false,
          cutover,
        })
      ).status,
    ).toBe('conflict');
    expect(record.config.contract).toBe('brand-remix-run');
  });
});

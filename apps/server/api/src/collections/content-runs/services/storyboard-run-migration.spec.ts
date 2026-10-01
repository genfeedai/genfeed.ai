import {
  storyboardLegacyConfigSchema,
  storyboardLegacyState,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { assertStoryboardEditable } from '@api/collections/content-runs/services/storyboard-plan-state';
import {
  convertStoryboardRun,
  storyboardConfigHash,
  storyboardLegacySceneInputHash,
} from '@api/collections/content-runs/services/storyboard-run-migration';
import { projectStoryboardRun } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import { ContentRunStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const config = storyboardLegacyConfigSchema.parse({
    contract: 'brand-remix-run',
    version: 1,
    recipeVersion: 1,
    revision: 4,
    phase: 'prefilled',
    readiness: { state: 'ready', issues: [] },
    draft: {
      fidelityMode: 'guided',
      identity: {},
      intent: { objective: 'A product video' },
      output: {
        kind: 'video',
        count: 1,
        aspectRatio: '9:16',
        durationSeconds: 12,
      },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'tiktok' },
    },
    sourceSnapshot: {
      capturedAt: '2026-09-30T12:00:00.000Z',
      selector: { kind: 'source_post', sourcePostId: 'source-1' },
      sourceId: 'source-1',
      platform: 'tiktok',
      title: 'A product',
      metrics: {},
      pattern: {},
      evidence: [],
    },
    concept: {
      savedAt: '2026-09-30T12:00:00.000Z',
      storyboard: [1, 2].map((ordinal) => ({
        id: `scene-${ordinal}`,
        ordinal,
        visualIntent: 'Show the product',
        durationSeconds: 6,
      })),
    },
    scenePipeline: {
      version: 1,
      language: 'en',
      state: 'storyboard',
      cancellationGeneration: 0,
      replacedAssetIds: [],
      receipts: [],
      scenes: {
        'scene-1': {
          identity: { avatarAssetId: 'avatar-1', speechVoiceId: 'voice-1' },
          referenceAssetIds: [],
          image: { state: 'ready', attempt: 1, assetId: 'image-1' },
          video: { state: 'pending', attempt: 1 },
          replacedAssetIds: [],
        },
      },
    },
  });
  const record = {
    id: 'run-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    isDeleted: false,
    updatedAt: new Date('2026-09-30T12:00:00.000Z'),
    config,
  };
  const context = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    migratedAt: '2026-09-30T14:00:00.000Z',
    authorizedAssetIds: new Set(['image-1', 'avatar-1']),
  };
  return { config, record, context };
}
describe('Lossless in-place Storyboard converter', () => {
  it('archives exact original state and preserves revision, scene IDs and real stale assets without inventing creator/request/model', () => {
    const { config, record, context } = fixture();
    const result = convertStoryboardRun(record, context);
    const converted = storyboardStoredRunConfigSchema.parse(result.config);
    expect(converted).toMatchObject({
      origin: 'migrated',
      revision: 4,
      createdByUserId: null,
      clientRequestId: null,
      submittedInputHash: null,
    });
    expect(converted.plan?.shots[0]).toMatchObject({
      id: 'scene-1',
      ordinal: 1,
      stillAssetId: 'image-1',
      stillFreshness: 'stale',
    });
    expect(converted.importedState?.originalConfig).toEqual(config);
    expect(result.report.preservationChecks).toEqual({
      originalArchiveUnchanged: true,
      creativeRevisionUnchanged: true,
      paidIdentitiesUnchanged: true,
    });
    expect(config.contract).toBe('brand-remix-run');
  });
  it('conversion is a no-op on the matching fingerprint even when the clock changes', () => {
    const { record, context } = fixture();
    const first = convertStoryboardRun(record, context);
    const second = convertStoryboardRun(
      { ...record, config: first.config },
      { ...context, migratedAt: '2026-10-01T00:00:00.000Z' },
    );
    expect(second.status).toBe('unchanged');
    expect(second.config).toEqual(first.config);
  });
  it('preserves 4:5 in the imported plan branch', () => {
    const { record, context, config } = fixture();
    if ('aspectRatio' in config.draft.output)
      config.draft.output.aspectRatio = '4:5';
    expect(
      storyboardStoredRunConfigSchema.parse(
        convertStoryboardRun(record, context).config,
      ).plan?.format,
    ).toBe('4:5');
  });
  it.each(['dialogue', 'runtime', 'non-scene'] as const)(
    'exposes recovery for unrepresentable %s without truncating the archive',
    (kind) => {
      const { record, context, config } = fixture();
      if (kind === 'dialogue' && config.concept)
        config.concept.storyboard[0].narration = 'x'.repeat(600);
      if (kind === 'runtime' && 'durationSeconds' in config.draft.output)
        config.draft.output.durationSeconds = 180;
      if (kind === 'non-scene')
        config.draft.output = { kind: 'image', aspectRatio: '1:1', count: 2 };
      const migrated = storyboardStoredRunConfigSchema.parse(
        convertStoryboardRun(record, context).config,
      );
      expect(migrated.plan).toBeNull();
      expect(migrated.importedState?.originalConfig).toEqual(config);
      expect(migrated.importedPresentation?.shots[0].action).toBe(
        'Show the product',
      );
    },
  );
  it('only marks stills fresh with ready output and verified matching source inputs', () => {
    const { record, context, config } = fixture();
    const scene = config.concept?.storyboard[0];
    if (!scene) throw new Error('fixture');
    const verifiedStills = new Map([
      [
        'scene-1',
        {
          assetId: 'image-1',
          inputHash: storyboardLegacySceneInputHash(config, scene),
        },
      ],
    ]);
    expect(
      storyboardStoredRunConfigSchema.parse(
        convertStoryboardRun(record, { ...context, verifiedStills }).config,
      ).plan?.shots[0].stillFreshness,
    ).toBe('fresh');
    scene.visualIntent = 'Changed';
    expect(
      storyboardStoredRunConfigSchema.parse(
        convertStoryboardRun(record, { ...context, verifiedStills }).config,
      ).plan?.shots[0].stillFreshness,
    ).toBe('stale');
  });
  it('uses deterministic IDs only for never-executed draft scenes', () => {
    const { record, context, config } = fixture();
    if (config.concept) delete config.concept.storyboard[1].id;
    delete config.scenePipeline;
    const first = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    const second = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(first.plan?.shots[1].id).toEqual(second.plan?.shots[1].id);
    expect(first.plan?.shots[1].id).toMatch(/^shot-/);
  });
  it('rejects cross-org, soft-deleted and unknown contracts without changing any bytes', () => {
    const { record, context } = fixture();
    for (const input of [
      { ...record, organizationId: 'other-org' },
      { ...record, isDeleted: true },
      { ...record, config: { contract: 'other' } },
    ]) {
      const result = convertStoryboardRun(input, context);
      expect(result.status).toBe('unsupported');
      expect(storyboardConfigHash(result.config)).toBe(
        storyboardConfigHash(input.config),
      );
    }
  });
  it('retains scene-specific reference evidence in recovery instead of silently changing conditioning', () => {
    const { record, context, config } = fixture();
    if (!config.scenePipeline) throw new Error('fixture');
    config.scenePipeline.scenes['scene-1'].referenceAssetIds = [
      'scene-only-reference',
    ];
    context.authorizedAssetIds.add('scene-only-reference');
    const converted = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(converted.plan).toBeNull();
    expect(converted.migrationReview?.issues).toContainEqual({
      code: 'LEGACY_PLAN_UNREPRESENTABLE',
      path: 'scenePipeline.scenes.scene-1.referenceAssetIds',
    });
    expect(converted.importedState?.originalConfig).toEqual(config);
  });
  it('keeps historical replaced outputs visible through authorized recovery assets', () => {
    const { record, context, config } = fixture();
    if (!config.scenePipeline) throw new Error('fixture');
    config.scenePipeline.replacedAssetIds = ['old-video:Mixed'];
    context.authorizedAssetIds.add('old-video:Mixed');
    const converted = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(converted.importedPresentation?.outputAssetIds).toContain(
      'old-video:Mixed',
    );
  });
  it('preserves review and paused campaign identities without synthesizing current plan approval', () => {
    const { record, context, config } = fixture();
    config.phase = 'paid_draft_ready';
    config.review = {
      batchId: 'batch:original',
      postIds: ['post:original'],
      approvedPostIds: ['post:original'],
      workflowExecutionId: 'review-execution:original',
    };
    config.paidDraft = {
      adAccountId: 'account:original',
      adId: 'ad:original',
      adSetId: 'set:original',
      campaignId: 'campaign:original',
      credentialId: 'credential:original',
      ingredientId: 'image-1',
      postId: 'post:original',
      recipeRevision: 4,
      recipeVersion: 1,
      replayed: false,
      status: 'PAUSED',
      variantId: 'variant:original',
      workflowExecutionId: 'campaign-execution:original',
    };
    const converted = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(converted.importedState?.originalConfig.review).toEqual(
      config.review,
    );
    expect(converted.importedState?.originalConfig.paidDraft).toEqual(
      config.paidDraft,
    );
    expect(converted.approvedRevision).toBeUndefined();
    expect(converted.revision).toBe(4);
  });
  it('blocks corrected-plan adoption while archived accepted generation is unresolved', () => {
    const { record, context, config } = fixture();
    config.generationClaim = {
      id: 'claim:original',
      claimedAt: '2026-09-30T12:00:00.000Z',
      variantIds: ['variant:original'],
    };
    const converted = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(() => assertStoryboardEditable(converted)).toThrow(
      'reconcile accepted',
    );
    expect(converted.importedState?.originalConfig.generationClaim).toEqual(
      config.generationClaim,
    );
  });
  it.each([
    'draft',
    'analysed',
    'quoted',
    'submitted',
    'ambiguous',
    'partial_failure',
    'cancelled_late',
    'completed',
  ] as const)(
    'preserves the %s lifecycle without repricing or changing accepted identities',
    (kind) => {
      const { record, context, config } = fixture();
      const pipeline = config.scenePipeline;
      if (!pipeline) throw new Error('fixture');
      if (kind === 'draft') {
        delete config.concept;
        delete config.scenePipeline;
      }
      if (kind === 'analysed')
        pipeline.analysis = {
          sourceAssetId: 'source-1',
          durationSeconds: 12,
          sizeBytes: 100,
          model: 'text:historical',
          transcription: { state: 'ready', attempt: 1 },
          rewrite: { state: 'ready', attempt: 1 },
          keyframes: [],
          vendorCostKnown: true,
        };
      if (kind !== 'draft' && kind !== 'analysed') {
        pipeline.quote = {
          id: 'quote:Original',
          revision: 4,
          operation: 'generate',
          inputHash: 'input:Original',
          createdAt: '2026-09-30T12:00:00.000Z',
          expiresAt: '2026-09-30T12:15:00.000Z',
          total: 3,
          items: [
            {
              key: 'line:Original',
              sceneId: 'scene-1',
              stage: 'video',
              model: 'video:Historical',
              credits: 3,
              billingMode: 'platform',
              attempt: 1,
            },
          ],
        };
        pipeline.state = 'quoted';
        if (kind !== 'quoted') {
          pipeline.operation = {
            id: 'operation:Original',
            quoteId: 'quote:Original',
            revision: 4,
            cancellationGeneration: 0,
            startedAt: '2026-09-30T12:01:00.000Z',
            userId: 'user:Original',
            sequence: 9,
          };
          pipeline.receipts = [
            {
              key: 'line:Original',
              operationId: 'operation:Original',
              reservationId: 'reservation:Original',
              actorUserId: 'user:Original',
              amount: 3,
              billingMode: 'platform',
              state: kind === 'completed' ? 'settled' : 'uncertain',
            },
          ];
          pipeline.scenes['scene-1'].video = {
            state:
              kind === 'completed'
                ? 'ready'
                : kind === 'ambiguous'
                  ? 'uncertain'
                  : 'submitted',
            attempt: 1,
            groupId: 'group:Original',
            claimToken: 'claim:Original',
            assetId: kind === 'completed' ? 'video:Original' : undefined,
          };
          pipeline.state =
            kind === 'completed'
              ? 'ready'
              : kind === 'partial_failure'
                ? 'partial_failure'
                : kind === 'cancelled_late'
                  ? 'cancelled'
                  : 'generating';
          if (kind === 'cancelled_late') pipeline.cancellationGeneration = 1;
        }
      }
      const original = structuredClone(config);
      const result = convertStoryboardRun(record, context);
      const converted = storyboardStoredRunConfigSchema.parse(result.config);
      expect(converted.importedState?.originalConfig).toEqual(original);
      expect(result.report.preservationChecks.paidIdentitiesUnchanged).toBe(
        true,
      );
      expect(
        converted.importedState?.activeConfig?.scenePipeline?.quote,
      ).toEqual(original.scenePipeline?.quote);
      expect(
        converted.importedState?.activeConfig?.scenePipeline?.receipts,
      ).toEqual(original.scenePipeline?.receipts);
      expect(converted.revision).toBe(4);
      if (
        [
          'submitted',
          'ambiguous',
          'partial_failure',
          'cancelled_late',
        ].includes(kind)
      ) {
        expect(converted.migrationRecovery).toMatchObject({
          operationId: 'operation:Original',
          previousSequence: 9,
          nextSequence: 10,
          jobId: 'storyboard-run-1-operation:Original-10',
          state: 'pending',
        });
        expect(
          converted.importedState?.activeConfig?.scenePipeline?.operation,
        ).toMatchObject({
          id: 'operation:Original',
          quoteId: 'quote:Original',
          userId: 'user:Original',
          revision: 4,
          sequence: 10,
          cancellationGeneration: 0,
        });
      } else expect(converted.migrationRecovery).toBeUndefined();
      expect(
        convertStoryboardRun({ ...record, config: converted }, context).status,
      ).toBe('unchanged');
    },
  );
  it('projects authorized legacy references containing spaces and slashes without remapping or native-ID weakening', () => {
    const { record, context, config } = fixture();
    if (!config.scenePipeline || !config.concept) throw new Error('fixture');
    config.scenePipeline.scenes['scene-1'].image.assetId = 'asset/old key';
    config.scenePipeline.replacedAssetIds = ['output/old key'];
    context.authorizedAssetIds.add('asset/old key');
    context.authorizedAssetIds.add('output/old key');
    expect(storyboardLegacyConfigSchema.safeParse(config).success).toBe(true);
    const result = convertStoryboardRun(record, context);
    expect(result.status).toBe('needs_review');
    const converted = storyboardStoredRunConfigSchema.parse(result.config);
    expect(converted.plan).toBeNull();
    expect(converted.importedPresentation?.shots[0]).toMatchObject({
      id: 'scene-1',
      stillAssetId: 'asset/old key',
    });
    expect(converted.importedPresentation?.outputAssetIds).toContain(
      'output/old key',
    );
    expect(converted.importedState?.originalConfig).toEqual(config);
  });
  it.each(['submitted', 'uncertain', 'reserved', 'uncertain-receipt'] as const)(
    'blocks guessed paid scene IDs when %s evidence lacks an operation',
    (kind) => {
      const { record, context, config } = fixture();
      if (!config.scenePipeline || !config.concept) throw new Error('fixture');
      delete config.concept.storyboard[1].id;
      delete config.scenePipeline.operation;
      config.scenePipeline.scenes = {};
      if (kind === 'submitted' || kind === 'uncertain')
        config.scenePipeline.scenes['scene-1'] = {
          identity: { avatarAssetId: 'avatar-1', speechVoiceId: 'voice-1' },
          referenceAssetIds: [],
          replacedAssetIds: [],
          image: { state: 'pending', attempt: 1 },
          video: { state: kind, attempt: 1, groupId: 'group:Original' },
        };
      else
        config.scenePipeline.receipts = [
          {
            key: 'line:Original',
            amount: 3,
            billingMode: 'platform',
            state: kind === 'reserved' ? 'reserved' : 'uncertain',
            reservationId: 'reservation:Original',
          },
        ];
      const result = convertStoryboardRun(record, context);
      const converted = storyboardStoredRunConfigSchema.parse(result.config);
      expect(result.status).toBe('needs_review');
      expect(converted.plan).toBeNull();
      expect(converted.importedPresentation?.shots[1].id).toBeNull();
      expect(converted.migrationReview?.issues).toContainEqual({
        code: 'LEGACY_STAGE_IDENTITY_MISSING',
        path: 'scenePipeline.operation',
      });
      expect(converted.migrationRecovery).toBeUndefined();
      expect(converted.importedState?.originalConfig).toEqual(config);
      expect(
        convertStoryboardRun({ ...record, config: converted }, context).status,
      ).toBe('unchanged');
    },
  );
  it.each(['transcription', 'rewrite', 'assembly'] as const)(
    'creates a neutral recovery outbox for cancelled late %s work without receipts',
    (kind) => {
      const { record, context, config } = fixture();
      if (!config.scenePipeline) throw new Error('fixture');
      const pipeline = config.scenePipeline;
      pipeline.state = 'cancelled';
      pipeline.cancellationGeneration = 2;
      pipeline.receipts = [];
      pipeline.scenes = {};
      pipeline.operation = {
        id: 'operation:Original',
        quoteId: 'quote:Original',
        revision: 4,
        cancellationGeneration: 1,
        startedAt: '2026-09-30T12:00:00.000Z',
        userId: 'user:Original',
        sequence: 9,
      };
      const stage = {
        state: 'submitted' as const,
        attempt: 1,
        groupId: 'group:Original',
        claimToken: 'claim:Original',
      };
      if (kind === 'assembly')
        pipeline.assembly = {
          orderedAssetIds: ['clip:Original'],
          transcription: stage,
        };
      else
        pipeline.analysis = {
          sourceAssetId: 'source-1',
          durationSeconds: 12,
          sizeBytes: 100,
          model: 'text:Original',
          keyframes: [],
          vendorCostKnown: true,
          transcription:
            kind === 'transcription' ? stage : { state: 'ready', attempt: 1 },
          rewrite: kind === 'rewrite' ? stage : { state: 'ready', attempt: 1 },
        };
      const result = convertStoryboardRun(record, context);
      const converted = storyboardStoredRunConfigSchema.parse(result.config);
      expect(converted.migrationRecovery).toMatchObject({
        operationId: 'operation:Original',
        previousSequence: 9,
        nextSequence: 10,
        jobId: 'storyboard-run-1-operation:Original-10',
      });
      expect(
        converted.importedState?.activeConfig?.scenePipeline
          ?.cancellationGeneration,
      ).toBe(2);
      expect(
        converted.importedState?.activeConfig?.scenePipeline?.operation,
      ).toMatchObject({ cancellationGeneration: 1, sequence: 10 });
      expect(converted.importedState?.originalConfig).toEqual(config);
      expect(() => assertStoryboardEditable(converted)).toThrow(
        'reconcile accepted',
      );
      expect(
        convertStoryboardRun({ ...record, config: converted }, context).status,
      ).toBe('unchanged');
    },
  );
  it.each(['merge', 'caption'] as const)(
    'blocks adoption until cancelled %s assembly work has its result',
    (kind) => {
      const { record, context, config } = fixture();
      if (!config.scenePipeline) throw new Error('fixture');
      const pipeline = config.scenePipeline;
      pipeline.state = 'cancelled';
      pipeline.scenes = {};
      pipeline.receipts = [];
      pipeline.operation = {
        id: 'operation/old key',
        quoteId: ' quote/old key ',
        revision: 4,
        cancellationGeneration: 1,
        startedAt: '2026-09-30T12:00:00.000Z',
        userId: 'user:Original',
        sequence: 9,
      };
      pipeline.assembly = {
        orderedAssetIds: ['clip:Original'],
        transcription: { state: 'ready', attempt: 1 },
        ...(kind === 'merge'
          ? { mergeJobId: 'merge/Original' }
          : { captionJobId: 'caption/Original' }),
      };
      const converted = storyboardStoredRunConfigSchema.parse(
        convertStoryboardRun(record, context).config,
      );
      expect(converted.migrationRecovery?.operationId).toBe(
        'operation/old key',
      );
      expect(() => assertStoryboardEditable(converted)).toThrow(
        'reconcile accepted',
      );
      if (kind === 'merge') pipeline.assembly.mergedAssetId = 'merged:Original';
      else pipeline.assembly.assetId = 'captioned:Original';
      const resolved = storyboardStoredRunConfigSchema.parse(
        convertStoryboardRun(record, context).config,
      );
      expect(resolved.migrationRecovery).toBeUndefined();
      expect(() => assertStoryboardEditable(resolved)).not.toThrow();
      expect(
        resolved.importedState?.originalConfig.scenePipeline?.operation
          ?.quoteId,
      ).toBe(' quote/old key ');
    },
  );
  it('preserves surrounding whitespace in validated opaque archived IDs and read-only references', () => {
    const { record, context, config } = fixture();
    if (!config.scenePipeline || !config.concept) throw new Error('fixture');
    config.concept.storyboard[0].id = ' scene:Original ';
    config.scenePipeline.scenes[' scene:Original '] =
      config.scenePipeline.scenes['scene-1'];
    delete config.scenePipeline.scenes['scene-1'];
    config.scenePipeline.scenes[' scene:Original '].image.assetId =
      ' asset/Original ';
    context.authorizedAssetIds.add(' asset/Original ');
    const converted = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(converted.plan).toBeNull();
    expect(converted.importedPresentation?.shots[0]).toMatchObject({
      id: ' scene:Original ',
      stillAssetId: ' asset/Original ',
    });
    expect(storyboardLegacyState(converted)?.concept?.storyboard[0].id).toBe(
      ' scene:Original ',
    );
    expect(
      storyboardLegacyState(converted)?.scenePipeline?.scenes[
        ' scene:Original '
      ].image.assetId,
    ).toBe(' asset/Original ');
  });
  it('public projection excludes archives, historical quote and funding state', () => {
    const { record, context } = fixture();
    const result = convertStoryboardRun(record, context);
    const projected = projectStoryboardRun({
      ...record,
      createdAt: record.updatedAt,
      status: ContentRunStatus.PENDING,
      config: result.config as never,
    });
    expect(projected.migrationReview?.status).toBe('required');
    expect(JSON.stringify(projected)).not.toContain('originalConfig');
    expect(JSON.stringify(projected)).not.toContain('importedState');
    expect(JSON.stringify(projected)).not.toContain('receipts');
  });
});

describe('Imported accepted-work recovery blockers', () => {
  it('keeps a missing accepted actor null and preserves the original quote/receipt identities', () => {
    const { record, context, config } = fixture();
    if (!config.scenePipeline) throw new Error('fixture');
    config.scenePipeline.operation = {
      id: 'old-op',
      quoteId: 'old-quote',
      revision: 3,
      sequence: 7,
      cancellationGeneration: 1,
      startedAt: '2026-09-30T12:00:00.000Z',
    };
    config.scenePipeline.state = 'blocked';
    config.scenePipeline.receipts = [
      {
        key: 'line:original',
        operationId: 'old-op',
        reservationId: 'hold:original',
        amount: 3,
        billingMode: 'platform',
        state: 'uncertain',
      },
    ];
    const converted = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(converted.createdByUserId).toBeNull();
    expect(converted.migrationReview?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LEGACY_STAGE_IDENTITY_MISSING' }),
      ]),
    );
    expect(
      converted.importedState?.originalConfig.scenePipeline?.operation?.userId,
    ).toBeUndefined();
    expect(
      converted.importedState?.originalConfig.scenePipeline?.receipts,
    ).toEqual(config.scenePipeline.receipts);
    expect(converted.migrationRecovery?.nextSequence).toBe(8);
  });
  it('never guesses an absent scene ID once its operation has been accepted', () => {
    const { record, context, config } = fixture();
    if (!config.scenePipeline || !config.concept) throw new Error('fixture');
    delete config.concept.storyboard[1].id;
    config.scenePipeline.operation = {
      id: 'old-op',
      quoteId: 'old-quote',
      userId: 'user-1',
      revision: 4,
      sequence: 1,
      cancellationGeneration: 0,
      startedAt: '2026-09-30T12:00:00.000Z',
    };
    const converted = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(converted.plan).toBeNull();
    expect(converted.importedPresentation?.shots[1].id).toBeNull();
    expect(
      converted.importedState?.originalConfig.concept?.storyboard[1].id,
    ).toBeUndefined();
  });
  it('does not discard a seventh distinct cast pair or overwrite an archive fingerprint', () => {
    const { record, context, config } = fixture();
    if (!config.concept) throw new Error('fixture');
    config.concept.storyboard = Array.from({ length: 7 }, (_, index) => ({
      id: `scene-${index + 1}`,
      ordinal: index + 1,
      visualIntent: 'Action',
      durationSeconds: 1,
      identity: {
        avatarAssetId: `avatar-${index + 1}`,
        speechVoiceId: `voice-${index + 1}`,
      },
    }));
    context.authorizedAssetIds = new Set(
      Array.from({ length: 7 }, (_, index) => `avatar-${index + 1}`),
    );
    const converted = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    expect(converted.plan).toBeNull();
    expect(converted.migrationReview?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LEGACY_CAST_LIMIT_EXCEEDED' }),
      ]),
    );
    if (!converted.importedState) throw new Error('fixture');
    converted.importedState.originalConfig.revision += 1;
    expect(storyboardStoredRunConfigSchema.safeParse(converted).success).toBe(
      false,
    );
  });
});

describe('Explicit corrected-plan adoption', () => {
  function setupAdoption() {
    const { record, context, config } = fixture();
    if (config.draft.output.kind !== 'video') throw new Error('fixture');
    config.draft.output.durationSeconds = 180;
    delete config.scenePipeline;
    const migrated = storyboardStoredRunConfigSchema.parse(
      convertStoryboardRun(record, context).config,
    );
    const store = {
      read: vi.fn(async () => ({ config: migrated })),
      save: vi.fn(async (_org, _brand, _run, _old, next) => next),
    };
    const source = { validatePlanAssets: vi.fn(async () => undefined) };
    const capability = {
      version: 1,
      runId: 'run-1',
      runRevision: 4,
      capabilityVersion: 'a'.repeat(64),
      status: 'available',
      requestedModelKey: 'video/current',
      reasonCode: null,
      eligibleModels: [],
      effectiveModel: {
        key: 'video/current',
        label: 'Current',
        provider: 'replicate',
        supportedDurationsSeconds: [6],
        defaultDurationSeconds: 6,
        hasInterpolation: false,
        supportedFormats: ['9:16'],
        capabilitySource: 'catalog',
      },
    };
    const capabilities = { resolve: vi.fn(async () => capability) };
    const service = new StoryboardRunsService(
      {} as never,
      {} as never,
      source as never,
      store as never,
      capabilities as never,
      { warn: vi.fn() } as never,
    );
    const plan = {
      title: 'Corrected',
      logline: '',
      videoModelKey: 'video/current',
      format: '9:16',
      runtimeBudgetSeconds: 12,
      cast: [],
      styleReferenceAssetIds: [],
      shots: [1, 2].map((ordinal) => ({
        id: `scene-${ordinal}`,
        ordinal,
        action: 'Corrected action',
        onScreenSpeaker: false,
        durationSeconds: 6,
        stillAssetId: 'forged-still',
        stillFreshness: 'fresh',
        transition: 'cut',
      })),
    };
    return { service, store, source, migrated, plan, config };
  }
  it('adopts one complete acknowledged plan while retaining the original archive and refusing submitted freshness', async () => {
    const { service, store, source, migrated, plan, config } = setupAdoption();
    await service.updatePlan('org-1', 'brand-1', 'run-1', {
      expectedRevision: 4,
      capabilityVersion: 'a'.repeat(64),
      plan,
    });
    const accepted = store.save.mock.calls[0][4];
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(accepted.revision).toBe(5);
    expect(accepted.migrationReview).toEqual({ status: 'clear', issues: [] });
    expect(accepted.importedState.originalConfig).toEqual(config);
    expect(
      accepted.plan.shots.every(
        (shot: { stillFreshness: string; stillAssetId?: string }) =>
          shot.stillFreshness === 'missing' && shot.stillAssetId === undefined,
      ),
    ).toBe(true);
    expect(source.validatePlanAssets).toHaveBeenCalledOnce();
    expect(migrated.revision).toBe(4);
    expect(migrated.plan).toBeNull();
  });
  it('keeps stage-identity blockers until accepted-work reconciliation resolves them', async () => {
    const { service, store, migrated, plan } = setupAdoption();
    if (migrated.origin !== 'migrated') throw new Error('fixture');
    migrated.migrationReview.issues.push({
      code: 'LEGACY_STAGE_IDENTITY_MISSING',
      path: 'scenePipeline.receipts',
    });
    await service.updatePlan('org-1', 'brand-1', 'run-1', {
      expectedRevision: 4,
      capabilityVersion: 'a'.repeat(64),
      plan,
    });
    expect(store.save.mock.calls[0][4].migrationReview).toEqual({
      status: 'required',
      issues: [
        {
          code: 'LEGACY_STAGE_IDENTITY_MISSING',
          path: 'scenePipeline.receipts',
        },
      ],
    });
  });
  it('rejects incomplete and unacknowledged adoption without a write', async () => {
    const { service, store, plan } = setupAdoption();
    await expect(
      service.updatePlan('org-1', 'brand-1', 'run-1', {
        expectedRevision: 4,
        capabilityVersion: 'a'.repeat(64),
        plan: { ...plan, shots: [] },
      }),
    ).rejects.toThrow('complete 2');
    await expect(
      service.updatePlan('org-1', 'brand-1', 'run-1', {
        expectedRevision: 4,
        plan,
      }),
    ).rejects.toThrow('STORYBOARD_CAPABILITIES_REQUIRED');
    expect(store.save).not.toHaveBeenCalled();
  });
});

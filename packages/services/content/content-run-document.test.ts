import { ContentRunStatus } from '@genfeedai/contracts';
import { getSerializer } from '@genfeedai/helpers/serializer.helper';
import {
  deserializeLegacyStoryboardRunDocument,
  deserializeStoryboardRunDocument,
} from '@services/content/content-run-document';
import type { JsonApiResponseDocument } from '@services/core/json-api';
import { describe, expect, it } from 'vitest';

function fixture(organizationId = 'org-1') {
  const ids = [
    'coffee-shot-1',
    'coffee_shot_1',
    'MixED:Scene-3',
    'd160833e-d602-4617-a21b-721eb9aa7da8',
  ];
  const scenePipeline = {
    version: 1,
    language: 'en',
    state: 'ready',
    cancellationGeneration: 2,
    replacedAssetIds: [],
    operation: {
      id: 'op:UNCHANGED',
      quoteId: 'quote:UNCHANGED',
      revision: 1,
      cancellationGeneration: 1,
      startedAt: '2026-09-30T12:00:00.000Z',
      userId: 'user-1',
      sequence: 4,
    },
    scenes: Object.fromEntries(
      ids.map((id, index) => [
        id,
        {
          identity: { avatarAssetId: 'avatar-1', speechVoiceId: 'voice-1' },
          referenceAssetIds: ['reference:Mixed-ID'],
          image: {
            attempt: 1,
            state: 'ready',
            assetId: `image-${organizationId}-${index}`,
          },
          video: {
            attempt: 1,
            state: 'ready',
            assetId: `video-${organizationId}-${index}`,
            groupId: `group:${index}`,
          },
          replacedAssetIds: [],
        },
      ]),
    ),
    receipts: [
      {
        key: 'receipt:line-A',
        operationId: 'op:UNCHANGED',
        reservationId: 'reserve:Mixed-ID',
        actorUserId: 'user-1',
        amount: 2,
        billingMode: 'platform',
        state: 'settled',
      },
    ],
    analysis: {
      sourceAssetId: 'source-1',
      durationSeconds: 16,
      sizeBytes: 100,
      model: 'text-model',
      transcription: { attempt: 1, state: 'ready' },
      rewrite: { attempt: 1, state: 'ready' },
      keyframes: [],
      vendorCostKnown: true,
      usage: { 'prompt-token.count': 10, 'prompt_token.count': 20 },
    },
  };
  const config = {
    contract: 'storyboard-run',
    version: 1,
    revision: 1,
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    state: 'ready',
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'A product' },
      capturedAt: '2026-09-30T12:00:00.000Z',
    },
    plan: {
      title: '',
      logline: '',
      format: '9:16',
      runtimeBudgetSeconds: 16,
      cast: [],
      styleReferenceAssetIds: ['reference:Mixed-ID'],
      shots: ids.map((id, index) => ({
        id,
        ordinal: index + 1,
        action: 'Action',
        onScreenSpeaker: false,
        durationSeconds: 4,
        stillAssetId: `image-${organizationId}-${index}`,
        stillFreshness: 'fresh',
        transition: 'cut',
      })),
    },
    scenePipeline,
    quote: {
      id: 'quote:UNCHANGED',
      revision: 1,
      operation: 'video',
      capabilityVersion: 'a'.repeat(64),
      maximumShotCount: null,
      amountKind: 'exact',
      inputHash: 'hash:Mixed-ID',
      createdAt: '2026-09-30T12:00:00.000Z',
      expiresAt: '2026-09-30T12:15:00.000Z',
      total: 8,
      items: ids.map((id) => ({
        key: `line:${id}`,
        shotId: id,
        slotOrdinal: null,
        stage: 'video',
        model: 'video-model',
        credits: 2,
        billingMode: 'platform',
        attempt: 1,
      })),
    },
  };
  const document: JsonApiResponseDocument = {
    data: {
      id: `run-${organizationId}`,
      type: 'storyboard-run',
      attributes: {
        organization_id: organizationId,
        brand_id: `brand-${organizationId}`,
        created_at: '2026-09-30T12:00:00.000Z',
        updated_at: '2026-09-30T12:00:00.000Z',
        config,
      },
    },
  };
  return { document, config, ids, scenePipeline };
}
describe('Versioned content-run response documents', () => {
  it('decodes read-only imported recovery with original legacy reference bytes and no native-ID weakening', () => {
    const { document, config } = fixture();
    if (
      !document.data ||
      Array.isArray(document.data) ||
      !document.data.attributes
    )
      throw new Error('fixture');
    const presentation = {
      title: 'Legacy',
      outputKind: 'video',
      shots: [
        {
          id: ' scene:Old ',
          ordinal: 1,
          action: 'Old action',
          dialogue: null,
          durationSeconds: 6,
          stillAssetId: ' asset/old key ',
        },
      ],
      outputAssetIds: [' asset/old key '],
    };
    document.data.attributes.config = {
      ...config,
      origin: 'migrated',
      plan: null,
      quote: undefined,
      scenePipeline: undefined,
      createdByUserId: null,
      clientRequestId: null,
      submittedInputHash: null,
      sourceSnapshot: {
        selector: { kind: 'source_post', sourcePostId: 'source-1' },
        sourceId: 'source-1',
        capturedAt: '2026-09-30T12:00:00.000Z',
        platform: 'tiktok',
        title: 'Legacy',
        metrics: {},
        pattern: {},
        evidence: [],
      },
      migration: {
        version: 1,
        sourceContract: 'brand-remix-run',
        sourceVersion: 1,
        sourceConfigHash: 'a'.repeat(64),
        migratedAt: '2026-09-30T12:00:00.000Z',
        converterVersion: 1,
      },
      migrationReview: {
        status: 'required',
        issues: [
          { code: 'LEGACY_PLAN_UNREPRESENTABLE', path: 'plan.identifiers' },
        ],
      },
      importedPresentation: presentation,
    };
    const decoded = deserializeStoryboardRunDocument(document);
    expect(decoded.config.plan).toBeNull();
    expect(decoded.config.importedPresentation).toEqual(presentation);
    expect(decoded.config.clientRequestId).toBeNull();
    expect(JSON.stringify(decoded)).not.toContain('originalConfig');
  });
  it('preserves colliding, mixed-case and UUID record keys while normalizing ordinary outer attributes', () => {
    const { document, config, ids } = fixture();
    const before = structuredClone(document);
    const run = deserializeStoryboardRunDocument(document);
    expect(run.organizationId).toBe('org-1');
    expect(run.brandId).toBe('brand-org-1');
    expect(Object.keys(run.config.scenePipeline?.scenes ?? {})).toEqual(ids);
    expect(
      run.config.plan?.shots.map(
        (shot) => run.config.scenePipeline?.scenes[shot.id].video.assetId,
      ),
    ).toEqual(ids.map((_, index) => `video-org-1-${index}`));
    expect(run.config.scenePipeline).toEqual(config.scenePipeline);
    expect(run.config.quote).toEqual(config.quote);
    expect(document).toEqual(before);
  });
  it('omits included copies and relationships before normalizing this closed Storyboard resource', () => {
    const { document, config } = fixture();
    const primary = document.data;
    if (!primary || Array.isArray(primary)) throw new Error('fixture');
    document.included = [primary];
    primary.relationships = {
      duplicate: { data: { id: primary.id ?? '', type: primary.type } },
    };
    const before = structuredClone(document);
    expect(
      deserializeStoryboardRunDocument(document).config.scenePipeline,
    ).toEqual(config.scenePipeline);
    expect(document).toEqual(before);
  });
  it('rejects collection, missing, null and unknown config instead of repairing it', () => {
    const { document, config } = fixture();
    for (const input of [
      { data: [] },
      { data: { id: 'run-1', type: 'storyboard-run', attributes: {} } },
      {
        data: {
          id: 'run-1',
          type: 'storyboard-run',
          attributes: { config: null },
        },
      },
      {
        data: {
          id: 'run-1',
          type: 'storyboard-run',
          attributes: { config: { ...config, unexpected: true } },
        },
      },
    ])
      expect(() => deserializeStoryboardRunDocument(input)).toThrow();
    expect(() => deserializeStoryboardRunDocument(document)).not.toThrow();
  });
  it('keeps identical opaque IDs isolated across two independent organization responses', () => {
    const first = deserializeStoryboardRunDocument(fixture('org-1').document);
    const second = deserializeStoryboardRunDocument(fixture('org-2').document);
    expect(
      first.config.scenePipeline?.scenes['coffee-shot-1'].video.assetId,
    ).toBe('video-org-1-0');
    expect(
      second.config.scenePipeline?.scenes['coffee-shot-1'].video.assetId,
    ).toBe('video-org-2-0');
  });
  it('round trips canonical config through the real serializer engine and client deserializer', () => {
    const { config } = fixture();
    const serializer = getSerializer(
      {
        type: 'storyboard-run',
        attributes: [
          'organizationId',
          'brandId',
          'createdAt',
          'updatedAt',
          'config',
        ],
      },
      'default',
    );
    const document = serializer.serialize({
      id: 'run-1',
      organizationId: 'org-1',
      brandId: 'brand-1',
      createdAt: '2026-09-30T12:00:00.000Z',
      updatedAt: '2026-09-30T12:00:00.000Z',
      config,
    }) as JsonApiResponseDocument;
    expect(
      deserializeStoryboardRunDocument(document).config.scenePipeline,
    ).toEqual(config.scenePipeline);
  });
  it('preserves the legacy scenePipeline while existing outer view normalization continues', () => {
    const { scenePipeline } = fixture();
    const attributes = {
      organization_id: 'org-1',
      brand_id: 'brand-1',
      brand: { id: 'brand-1', name: 'Brand', contextMode: 'brand' },
      contract: 'brand-remix-run',
      version: 1,
      recipeVersion: 1,
      revision: 1,
      status: ContentRunStatus.PENDING,
      phase: 'ready_for_review',
      readiness: { state: 'ready', issues: [] },
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: { objective: 'Product' },
        output: {
          kind: 'video',
          aspectRatio: '9:16',
          count: 1,
          durationSeconds: 16,
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
        title: 'Source',
        metrics: {},
        pattern: {},
        evidence: [],
      },
      created_at: '2026-09-30T12:00:00.000Z',
      updated_at: '2026-09-30T12:00:00.000Z',
      scenePipeline,
    };
    // The historical view has no organizationId field; scope is the authenticated API request.
    const { organization_id: _organization, ...legacyAttributes } = attributes;
    const document = {
      data: {
        type: 'brand-remix-run',
        id: 'legacy-1',
        attributes: legacyAttributes,
      },
    };
    expect(
      deserializeLegacyStoryboardRunDocument(document).scenePipeline,
    ).toEqual(scenePipeline);
    expect(() =>
      deserializeLegacyStoryboardRunDocument({
        data: {
          ...document.data,
          attributes: { ...legacyAttributes, scene_pipeline: scenePipeline },
        },
      }),
    ).toThrow();
  });
});

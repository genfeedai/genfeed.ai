import { MediaAssessmentService } from '@api/services/media-assessment/media-assessment.service';
import type { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import { captionSubjectKey } from '@api/services/media-text-decisions/media-text-decision.settings';
import { CredentialPlatform } from '@genfeedai/contracts';
import { DEFAULT_MODERATION_THRESHOLDS } from '@genfeedai/contracts/api-types/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { PrismaService } from '@libs/prisma/prisma.service';

const HASH = 'c'.repeat(64);
const NOW = new Date('2026-09-26T10:00:00.000Z');

function perceptionRow(ingredientId: string, overrides = {}) {
  return {
    assetHash: HASH,
    attempts: 0,
    audioUrl: null,
    createdAt: NOW,
    description: null,
    descriptionModel: null,
    descriptionStatus: 'failed',
    diagnostics: [],
    durationSeconds: null,
    frames: [],
    framesStatus: 'ready',
    id: `perception-${ingredientId}`,
    ingredientId,
    kind: 'image',
    ocr: [],
    ocrStatus: 'ready',
    organizationId: 'org-1',
    reusedFromId: null,
    schemaVersion: 1,
    transcript: null,
    transcriptStatus: 'unavailable',
    updatedAt: NOW,
    visionEvaluationId: null,
    ...overrides,
  };
}

function moderationRow(ingredientId: string, hate: number, mode = 'shadow') {
  const clean = {
    flaggedCategories: [],
    isFlagged: false,
    maxConfidence: hate,
    triggers: [],
  };
  return {
    assetHash: HASH,
    candidateVerdict: clean,
    createdAt: NOW,
    id: `moderation-${ingredientId}`,
    ingredientId,
    inputs: [{ frameIndex: 2, scores: { hate }, source: 'frame' }],
    mode,
    organizationId: 'org-1',
    provider: 'openai',
    reusedFromId: null,
    thresholds: DEFAULT_MODERATION_THRESHOLDS,
    updatedAt: NOW,
    verdict: clean,
  };
}

function makeHarness(options: {
  categories?: Record<string, string>;
  textDecisions?: Record<string, unknown>[];
  config?: Record<string, unknown>;
  evaluations?: Record<string, unknown>[];
  moderations?: Record<string, unknown>[];
  perceptions?: Record<string, unknown>[];
  readinessDiagnostics?: Record<string, unknown>[];
}) {
  const config: Record<string, unknown> = {
    MEDIA_GATE_VISION_MODE: 'off',
    MODERATION_MODE: 'live',
    MODERATION_PROVIDER: 'openai',
    ...options.config,
  };
  const evaluatePublishReadiness = vi.fn().mockResolvedValue({
    checkedAt: NOW.toISOString(),
    diagnostics: options.readinessDiagnostics ?? [],
    isBlocked: false,
  });
  const evaluationFindMany = vi
    .fn()
    .mockResolvedValue(options.evaluations ?? []);
  const categories = options.categories ?? {};
  const service = new MediaAssessmentService(
    {
      evaluation: { findMany: evaluationFindMany },
      ingredient: {
        findMany: vi.fn(
          async ({ where }: { where: { id: { in: string[] } } }) =>
            where.id.in.map((id) => ({
              category: categories[id] ?? 'IMAGE',
              id,
            })),
        ),
      },
      mediaModeration: {
        findMany: vi.fn().mockResolvedValue(options.moderations ?? []),
      },
      mediaPerception: {
        findMany: vi.fn().mockResolvedValue(options.perceptions ?? []),
      },
      mediaTextDecision: {
        findMany: vi.fn().mockResolvedValue(options.textDecisions ?? []),
      },
    } as unknown as PrismaService,
    { evaluatePublishReadiness } as unknown as MediaReadinessService,
    { get: (key: string) => config[key] } as unknown as ConfigService,
  );
  return { evaluatePublishReadiness, evaluationFindMany, service };
}

const REQUEST = {
  assetIds: ['asset-1'],
  organizationId: 'org-1',
  platforms: [CredentialPlatform.INSTAGRAM],
};

describe('MediaAssessmentService', () => {
  it('is clean with every source off and settled perception', async () => {
    const { service } = makeHarness({
      config: { MODERATION_MODE: 'off' },
      perceptions: [perceptionRow('asset-1')],
    });

    await expect(service.assessPublishMedia(REQUEST)).resolves.toEqual({
      isBlocking: false,
      isPerceptionPending: false,
      reasons: [],
      warnings: [],
    });
  });

  it('blocks on readiness errors and carries warnings', async () => {
    const { service } = makeHarness({
      perceptions: [perceptionRow('asset-1')],
      readinessDiagnostics: [
        {
          assetId: 'asset-1',
          message: 'Video is 95s; Reels allow 90s.',
          property: 'duration',
          severity: 'error',
        },
        {
          assetId: 'asset-1',
          message: 'PNG may be converted.',
          property: 'container',
          severity: 'warning',
        },
      ],
    });

    const assessment = await service.assessPublishMedia(REQUEST);
    expect(assessment.isBlocking).toBe(true);
    expect(assessment.reasons).toEqual([
      expect.objectContaining({
        code: 'readiness:duration',
        source: 'readiness',
      }),
    ]);
    expect(assessment.warnings).toEqual([
      expect.objectContaining({ code: 'readiness:container' }),
    ]);
  });

  it('re-evaluates a stored shadow verdict under live settings', async () => {
    const { service } = makeHarness({
      moderations: [moderationRow('asset-1', 0.92)],
      perceptions: [perceptionRow('asset-1')],
    });

    const assessment = await service.assessPublishMedia(REQUEST);
    expect(assessment.isBlocking).toBe(true);
    expect(assessment.reasons).toEqual([
      expect.objectContaining({
        code: 'moderation:hate',
        message: 'Moderation flagged hate (92% on frame 3).',
        source: 'moderation',
      }),
    ]);
  });

  it('never blocks on moderation in shadow mode', async () => {
    const { service } = makeHarness({
      config: { MODERATION_MODE: 'shadow' },
      moderations: [moderationRow('asset-1', 0.99, 'live')],
      perceptions: [perceptionRow('asset-1')],
    });

    await expect(service.assessPublishMedia(REQUEST)).resolves.toMatchObject({
      isBlocking: false,
      reasons: [],
    });
  });

  it('blocks on vision flags only in live mode', async () => {
    const perceptions = [
      perceptionRow('asset-1', { visionEvaluationId: 'evaluation-1' }),
    ];
    const evaluations = [
      {
        data: {
          flags: {
            isFlagged: true,
            reasons: ['severe_artifacts'],
            severity: 'critical',
          },
        },
        id: 'evaluation-1',
      },
    ];

    const shadow = makeHarness({
      config: { MEDIA_GATE_VISION_MODE: 'shadow', MODERATION_MODE: 'off' },
      evaluations,
      perceptions,
    });
    await expect(
      shadow.service.assessPublishMedia(REQUEST),
    ).resolves.toMatchObject({ isBlocking: false });
    expect(shadow.evaluationFindMany).not.toHaveBeenCalled();

    const live = makeHarness({
      config: { MEDIA_GATE_VISION_MODE: 'live', MODERATION_MODE: 'off' },
      evaluations,
      perceptions,
    });
    const assessment = await live.service.assessPublishMedia(REQUEST);
    expect(assessment.isBlocking).toBe(true);
    expect(assessment.reasons).toEqual([
      expect.objectContaining({
        code: 'vision:severe_artifacts',
        source: 'vision',
      }),
    ]);
  });

  it('reports pending perception without blocking', async () => {
    const { service } = makeHarness({
      config: { MODERATION_MODE: 'off' },
      perceptions: [perceptionRow('asset-1', { transcriptStatus: 'pending' })],
    });

    await expect(
      service.assessPublishMedia({
        ...REQUEST,
        assetIds: ['asset-1', 'asset-2'],
      }),
    ).resolves.toMatchObject({ isBlocking: false, isPerceptionPending: true });
  });

  it('skips readiness when no platform is given', async () => {
    const { evaluatePublishReadiness, service } = makeHarness({
      config: { MODERATION_MODE: 'off' },
      perceptions: [perceptionRow('asset-1')],
    });

    await service.assessPublishMedia({ ...REQUEST, platforms: [] });
    expect(evaluatePublishReadiness).not.toHaveBeenCalled();
  });

  it('treats live moderation without a result as checks pending, never clean', async () => {
    const { service } = makeHarness({
      config: { OPENAI_API_KEY: 'key' },
      perceptions: [perceptionRow('asset-1')],
    });

    const assessment = await service.assessPublishMedia(REQUEST);
    expect(assessment.isBlocking).toBe(true);
    expect(assessment.reasons).toEqual([
      expect.objectContaining({
        code: 'perception:checks_pending',
        source: 'perception',
      }),
    ]);
  });

  it('treats live vision without an evaluation as checks pending', async () => {
    const { service } = makeHarness({
      config: { MEDIA_GATE_VISION_MODE: 'live', MODERATION_MODE: 'off' },
      perceptions: [perceptionRow('asset-1')],
    });

    await expect(service.assessPublishMedia(REQUEST)).resolves.toMatchObject({
      isBlocking: true,
      reasons: [expect.objectContaining({ code: 'perception:checks_pending' })],
    });
  });

  it('never gates a non-media attachment on pending checks', async () => {
    const { service } = makeHarness({
      categories: { 'asset-1': 'TEXT' },
      config: { MEDIA_GATE_VISION_MODE: 'live', OPENAI_API_KEY: 'key' },
    });

    await expect(service.assessPublishMedia(REQUEST)).resolves.toMatchObject({
      isBlocking: false,
      reasons: [],
    });
  });

  it('forces review on a confident not-brand-safe transcript and warns on caption mismatch (#4882)', async () => {
    const caption = 'Sunset yoga on the beach';
    const { service } = makeHarness({
      config: { MEDIA_TEXT_GATE_DECISION_MODE: 'live', MODERATION_MODE: 'off' },
      perceptions: [perceptionRow('asset-1')],
      textDecisions: [
        {
          assetHash: HASH,
          decisions: [
            { confidence: 0.95, name: 'isBrandSafe', source: 'transcript', value: false },
            { confidence: 0.6, name: 'isOnBrand', source: 'transcript', value: false },
          ],
          ingredientId: 'asset-1',
          mode: 'live',
          subjectKey: 'asset',
        },
        {
          assetHash: HASH,
          decisions: [
            { confidence: 0.9, name: 'isCaptionConsistent', source: 'description', value: false },
          ],
          ingredientId: 'asset-1',
          mode: 'live',
          subjectKey: captionSubjectKey(caption),
        },
      ],
    });

    const assessment = await service.assessPublishMedia({ ...REQUEST, caption });

    expect(assessment.isBlocking).toBe(true);
    expect(assessment.reasons).toEqual([
      expect.objectContaining({
        code: 'text:not_brand_safe',
        message: 'The transcript was judged not brand-safe (95%).',
        source: 'transcript',
      }),
    ]);
    expect(assessment.warnings).toEqual([
      expect.objectContaining({ code: 'text:caption_inconsistent' }),
    ]);
  });

  it('treats a live text gate without a decision as checks pending', async () => {
    const { service } = makeHarness({
      config: { MEDIA_TEXT_GATE_DECISION_MODE: 'live', MODERATION_MODE: 'off' },
      perceptions: [perceptionRow('asset-1')],
    });

    await expect(service.assessPublishMedia(REQUEST)).resolves.toMatchObject({
      isBlocking: true,
      reasons: [expect.objectContaining({ code: 'perception:checks_pending' })],
    });
  });

  it('ignores text decisions outside live mode', async () => {
    const { service } = makeHarness({
      config: { MEDIA_TEXT_GATE_DECISION_MODE: 'shadow', MODERATION_MODE: 'off' },
      perceptions: [perceptionRow('asset-1')],
      textDecisions: [
        {
          assetHash: HASH,
          decisions: [
            { confidence: 0.99, name: 'isBrandSafe', source: 'transcript', value: false },
          ],
          ingredientId: 'asset-1',
          mode: 'shadow',
          subjectKey: 'asset',
        },
      ],
    });

    await expect(service.assessPublishMedia(REQUEST)).resolves.toMatchObject({
      isBlocking: false,
    });
  });
});

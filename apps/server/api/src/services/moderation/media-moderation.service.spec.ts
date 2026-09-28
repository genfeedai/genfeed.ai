import type { PlatformFeatureSettingsService } from '@api/feature-flag/platform-feature-settings.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import type { ModerationProviders } from '@api/services/moderation/moderation.tokens';
import { NullModerationProvider } from '@api/services/moderation/providers/null-moderation.provider';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';
import { DEFAULT_MODERATION_THRESHOLDS } from '@genfeedai/contracts/api-types/contracts';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import type {
  IMediaPerception,
  IModerationProvider,
  IPlatformFeatureSettings,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';

const HASH = 'f'.repeat(64);
const JOB = { ingredientId: 'asset-1', organizationId: 'org-1' };

function sceneDescription(hasSuspectedMinors: boolean) {
  return {
    brandElements: [],
    contentWarnings: [],
    hasPeople: true,
    hasSuspectedMinors,
    setting: '',
    subjects: [],
    summary: 'Two people.',
    textOnScreen: '',
  };
}

function perception(overrides: Partial<IMediaPerception> = {}) {
  return {
    assetHash: HASH,
    createdAt: '2026-09-26T10:00:00.000Z',
    description: sceneDescription(false),
    descriptionModel: 'vision-model',
    descriptionStatus: 'ready',
    diagnostics: [],
    durationSeconds: 12,
    frames: [
      {
        height: 100,
        index: 0,
        storageKey: 'k0',
        timestampSeconds: 1,
        url: 'https://cdn/f0.jpg',
        width: 100,
      },
      {
        height: 100,
        index: 1,
        storageKey: 'k1',
        timestampSeconds: 5,
        url: 'https://cdn/f1.jpg',
        width: 100,
      },
    ],
    framesStatus: 'ready',
    id: 'perception-1',
    ingredientId: 'asset-1',
    kind: 'video',
    ocr: [
      { frameIndex: 0, text: 'BUY NOW' },
      { frameIndex: 1, text: '' },
    ],
    ocrStatus: 'ready',
    organizationId: 'org-1',
    reusedFromId: null,
    schemaVersion: 1,
    transcript: { durationSeconds: 12, language: 'en', text: 'hello there' },
    transcriptStatus: 'ready',
    updatedAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  } as IMediaPerception;
}

function makeHarness(
  options: {
    featureSettings?: Partial<IPlatformFeatureSettings>;
    existing?: Record<string, unknown> | null;
    isEnabled?: boolean;
    perception?: IMediaPerception | null;
    reusable?: Record<string, unknown> | null;
  } = {},
) {
  const provider = {
    classifyFrames: vi
      .fn()
      .mockResolvedValue([{ violence: 0.1 }, { violence: 0.9 }]),
    classifyImage: vi.fn().mockResolvedValue({ sexual: 0.05 }),
    classifyText: vi.fn().mockResolvedValue({ hate: 0.02 }),
    isEnabled: options.isEnabled ?? true,
    name: 'openai' as const,
  };
  const findFirst = vi
    .fn()
    .mockResolvedValueOnce(options.existing ?? null)
    .mockResolvedValueOnce(options.reusable ?? null);
  const upsert = vi.fn().mockResolvedValue({});
  const ingredientFindFirst = vi
    .fn()
    .mockResolvedValue({ brandId: 'brand-1', userId: 'user-1' });
  const ingredientFindMany = vi.fn().mockResolvedValue([]);
  const activities = { record: vi.fn().mockResolvedValue({}) };
  const getForAsset = vi
    .fn()
    .mockResolvedValue(
      options.perception === undefined ? perception() : options.perception,
    );
  const featureSettingsService = {
    getFeatureSettings: vi.fn(async () => ({
      ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
      moderationMode: 'live',
      moderationProvider: 'openai',
      ...options.featureSettings,
    })),
  };
  const providers: ModerationProviders = {
    none: new NullModerationProvider(),
    openai: provider as unknown as IModerationProvider,
  };
  const logger = { log: vi.fn(), warn: vi.fn() };

  const service = new MediaModerationService(
    {
      ingredient: {
        findFirst: ingredientFindFirst,
        findMany: ingredientFindMany,
      },
      mediaModeration: { findFirst, findMany: vi.fn(), upsert },
      mediaPerception: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService,
    { getForAsset } as unknown as MediaPerceptionService,
    providers,
    activities as unknown as ActivityRecorderService,
    featureSettingsService as unknown as PlatformFeatureSettingsService,
    logger as unknown as LoggerService,
  );
  return {
    activities,
    ingredientFindFirst,
    ingredientFindMany,
    findFirst,
    getForAsset,
    logger,
    provider,
    service,
    upsert,
  };
}

function storedRow(overrides: Record<string, unknown> = {}) {
  const clean = {
    flaggedCategories: [],
    isFlagged: false,
    maxConfidence: 0.55,
    triggers: [],
  };
  return {
    assetHash: HASH,
    candidateVerdict: clean,
    createdAt: new Date(),
    id: 'moderation-1',
    ingredientId: 'asset-1',
    inputs: [{ frameIndex: null, scores: { hate: 0.55 }, source: 'ocr' }],
    mode: 'shadow',
    organizationId: 'org-1',
    provider: 'openai',
    reusedFromId: null,
    thresholds: DEFAULT_MODERATION_THRESHOLDS,
    updatedAt: new Date(),
    verdict: clean,
    ...overrides,
  };
}

describe('MediaModerationService.moderate', () => {
  it('classifies frames, transcript and OCR and flags in live mode', async () => {
    const h = makeHarness();

    await expect(h.service.moderate(JOB)).resolves.toBe('classified');

    expect(h.provider.classifyFrames).toHaveBeenCalledWith([
      'https://cdn/f0.jpg',
      'https://cdn/f1.jpg',
    ]);
    expect(h.provider.classifyText).toHaveBeenCalledWith('hello there');
    expect(h.provider.classifyText).toHaveBeenCalledWith('BUY NOW');
    const { create } = h.upsert.mock.calls[0][0];
    expect(create).toEqual(
      expect.objectContaining({
        flaggedCategories: ['violence'],
        ingredientId: 'asset-1',
        isFlagged: true,
        mode: 'live',
        organizationId: 'org-1',
        provider: 'openai',
      }),
    );
    expect(create.verdict.triggers).toEqual([
      expect.objectContaining({ frameIndex: 1, source: 'frame' }),
    ]);
    expect(h.activities.record).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        entityId: 'asset-1',
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.MEDIA_MODERATION_FLAGGED,
        organizationId: 'org-1',
        source: ActivitySource.MEDIA_MODERATION,
      }),
    );
  });

  it('persists isFlagged=false in shadow mode and logs what would have flagged', async () => {
    const h = makeHarness({ featureSettings: { moderationMode: 'shadow' } });

    await h.service.moderate(JOB);

    const { create } = h.upsert.mock.calls[0][0];
    expect(create.isFlagged).toBe(false);
    expect(create.verdict.isFlagged).toBe(false);
    expect(create.candidateVerdict.flaggedCategories).toEqual(['violence']);
    expect(h.activities.record).not.toHaveBeenCalled();
    expect(h.logger.log).toHaveBeenCalledWith(
      expect.stringContaining('would flag'),
      expect.objectContaining({ flaggedCategories: ['violence'] }),
    );
  });

  it.each([
    ['the provider is none', { isEnabled: false }],
    [
      'the mode is off',
      { featureSettings: { moderationMode: 'off' as const } },
    ],
  ])('persists no verdict when %s', async (_label, options) => {
    const h = makeHarness(options);

    await expect(h.service.moderate(JOB)).resolves.toBe('skipped');
    expect(h.getForAsset).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('waits for perception to settle', async () => {
    const h = makeHarness({
      perception: perception({ transcriptStatus: 'pending' }),
    });

    await expect(h.service.moderate(JOB)).resolves.toBe('skipped');
    expect(h.provider.classifyFrames).not.toHaveBeenCalled();
  });

  it('waits for the scene description, whose minors evidence sets the visual threshold', async () => {
    const h = makeHarness({
      perception: perception({
        description: null,
        descriptionModel: null,
        descriptionStatus: 'pending',
      }),
    });

    await expect(h.service.moderate(JOB)).resolves.toBe('skipped');
    expect(h.provider.classifyFrames).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('applies the minors threshold when the scene description could not be produced', async () => {
    const h = makeHarness({
      perception: perception({
        description: null,
        descriptionModel: null,
        descriptionStatus: 'failed',
      }),
    });
    h.provider.classifyFrames.mockResolvedValueOnce([
      { sexual: 0.3 },
      { sexual: 0.05 },
    ]);

    await h.service.moderate(JOB);

    expect(h.upsert.mock.calls[0][0].create.flaggedCategories).toEqual([
      'sexual_minors',
    ]);
  });

  it('re-evaluates a cached clean verdict once the description suspects minors', async () => {
    const h = makeHarness({
      existing: storedRow({
        inputs: [{ frameIndex: 0, scores: { sexual: 0.3 }, source: 'frame' }],
        mode: 'live',
      }),
      perception: perception({ description: sceneDescription(true) }),
    });

    await expect(h.service.moderate(JOB)).resolves.toBe('reevaluated');

    expect(h.provider.classifyFrames).not.toHaveBeenCalled();
    const { create } = h.upsert.mock.calls[0][0];
    expect(create.flaggedCategories).toEqual(['sexual_minors']);
    expect(create.isFlagged).toBe(true);
    expect(create.inputs[0].scores).toEqual({
      sexual: 0.3,
      sexual_minors: 0.3,
    });
  });

  it('applies current minors evidence to reused scores of identical bytes', async () => {
    const h = makeHarness({
      perception: perception({ description: sceneDescription(true) }),
      reusable: storedRow({
        id: 'moderation-source',
        ingredientId: 'asset-0',
        inputs: [{ frameIndex: 0, scores: { sexual: 0.3 }, source: 'frame' }],
      }),
    });

    await expect(h.service.moderate(JOB)).resolves.toBe('reused');

    expect(h.upsert.mock.calls[0][0].create.flaggedCategories).toEqual([
      'sexual_minors',
    ]);
  });

  it('classifies a still image through its stored frame', async () => {
    const h = makeHarness({
      perception: perception({
        frames: [perception().frames[0]],
        kind: 'image',
        ocr: [],
        transcript: null,
        transcriptStatus: 'unavailable',
      }),
    });

    await h.service.moderate(JOB);

    expect(h.provider.classifyImage).toHaveBeenCalledWith('https://cdn/f0.jpg');
    expect(h.provider.classifyFrames).not.toHaveBeenCalled();
    expect(h.provider.classifyText).not.toHaveBeenCalled();
  });

  it('skips an asset already moderated under the current settings', async () => {
    const h = makeHarness({ existing: storedRow({ mode: 'live' }) });

    await expect(h.service.moderate(JOB)).resolves.toBe('skipped');
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.provider.classifyFrames).not.toHaveBeenCalled();
  });

  it('re-evaluates a shadow verdict when the mode goes live, without calling the vendor', async () => {
    const h = makeHarness({ existing: storedRow({ mode: 'shadow' }) });

    await expect(h.service.moderate(JOB)).resolves.toBe('reevaluated');

    expect(h.provider.classifyFrames).not.toHaveBeenCalled();
    expect(h.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({
        flaggedCategories: ['hate'],
        isFlagged: true,
        mode: 'live',
      }),
    );
  });

  it('never sends a deleted asset to the vendor', async () => {
    const h = makeHarness();
    h.ingredientFindFirst.mockResolvedValueOnce(null);

    await expect(h.service.moderate(JOB)).resolves.toBe('skipped');
    expect(h.provider.classifyFrames).not.toHaveBeenCalled();
  });

  it('applies the minors threshold to visual sexual scores when perception suspects minors', async () => {
    const h = makeHarness({
      perception: perception({
        description: {
          brandElements: [],
          contentWarnings: [],
          hasPeople: true,
          hasSuspectedMinors: true,
          setting: '',
          subjects: [],
          summary: 'Two people.',
          textOnScreen: '',
        },
        descriptionStatus: 'ready',
      }),
    });
    h.provider.classifyFrames.mockResolvedValueOnce([
      { sexual: 0.3 },
      { sexual: 0.05 },
    ]);

    await h.service.moderate(JOB);

    const { create } = h.upsert.mock.calls[0][0];
    expect(create.flaggedCategories).toEqual(['sexual_minors']);
    expect(create.inputs[0].scores).toEqual({
      sexual: 0.3,
      sexual_minors: 0.3,
    });
  });

  it('never re-evaluates text-only scores because of visual minors evidence', async () => {
    const h = makeHarness({
      existing: storedRow({
        inputs: [{ frameIndex: null, scores: { sexual: 0.3 }, source: 'ocr' }],
        mode: 'live',
      }),
      perception: perception({ description: sceneDescription(true) }),
    });

    await expect(h.service.moderate(JOB)).resolves.toBe('skipped');
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('re-evaluates the stored scores of identical bytes instead of calling the provider', async () => {
    const h = makeHarness({
      reusable: {
        assetHash: HASH,
        candidateVerdict: {
          flaggedCategories: [],
          isFlagged: false,
          maxConfidence: 0.4,
          triggers: [],
        },
        createdAt: new Date(),
        id: 'moderation-source',
        ingredientId: 'asset-0',
        inputs: [{ frameIndex: null, scores: { hate: 0.55 }, source: 'ocr' }],
        mode: 'shadow',
        organizationId: 'org-1',
        provider: 'openai',
        reusedFromId: null,
        thresholds: {},
        updatedAt: new Date(),
        verdict: {
          flaggedCategories: [],
          isFlagged: false,
          maxConfidence: 0.55,
          triggers: [],
        },
      },
    });

    await expect(h.service.moderate(JOB)).resolves.toBe('reused');

    expect(h.provider.classifyFrames).not.toHaveBeenCalled();
    expect(h.provider.classifyText).not.toHaveBeenCalled();
    expect(h.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({
        flaggedCategories: ['hate'],
        isFlagged: true,
        reusedFromId: 'moderation-source',
      }),
    );
  });
});

describe('MediaModerationService.findUnmoderatedAssets', () => {
  it('offers only assets whose scene description has settled', async () => {
    const h = makeHarness();

    await h.service.findUnmoderatedAssets(new Date(0), 10);

    expect(
      h.ingredientFindMany.mock.calls[0][0].where.mediaPerceptions.some,
    ).toEqual(
      expect.objectContaining({ descriptionStatus: { not: 'pending' } }),
    );
  });
});

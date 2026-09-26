import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import {
  MediaTextDecisionService,
  MediaTextDecisionUnansweredError,
} from '@api/services/media-text-decisions/media-text-decision.service';
import { captionSubjectKey } from '@api/services/media-text-decisions/media-text-decision.settings';
import type { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import type { IMediaPerception } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';

const HASH = 'e'.repeat(64);
const JOB = { ingredientId: 'asset-1', organizationId: 'org-1' };

function perception(overrides: Partial<IMediaPerception> = {}) {
  return {
    assetHash: HASH,
    description: {
      brandElements: [],
      contentWarnings: ['alcohol'],
      hasPeople: true,
      hasSuspectedMinors: false,
      setting: 'bar',
      subjects: ['bartender'],
      summary: 'A bartender mixes a cocktail.',
      textOnScreen: 'HAPPY HOUR',
    },
    descriptionStatus: 'ready',
    frames: [],
    framesStatus: 'ready',
    ocr: [{ frameIndex: 0, text: 'HAPPY HOUR' }],
    ocrStatus: 'ready',
    transcript: {
      durationSeconds: 9,
      language: 'en',
      text: ' Two for one tonight. ',
    },
    transcriptStatus: 'ready',
    ...overrides,
  } as IMediaPerception;
}

function makeHarness(
  options: {
    brand?: { description: string | null; label: string } | null;
    existing?: boolean;
    isBound?: boolean;
    mode?: string;
    perception?: IMediaPerception | null;
    posts?: Array<{ description: string }>;
  } = {},
) {
  const decide = vi.fn().mockResolvedValue({ confidence: 0.93, value: false });
  const upsert = vi.fn().mockResolvedValue({});
  const ingredientFindMany = vi.fn().mockResolvedValue([]);
  const findFirst = vi
    .fn()
    .mockResolvedValue(options.existing ? { id: 'decision-1' } : null);
  const config: Record<string, unknown> = {
    MEDIA_TEXT_GATE_DECISION_MODE: options.mode ?? 'live',
  };
  const service = new MediaTextDecisionService(
    {
      ingredient: {
        findMany: ingredientFindMany,
        findFirst: vi.fn().mockResolvedValue({
          brand:
            options.brand === undefined
              ? { description: 'Craft cocktail bar.', label: 'Barrel' }
              : options.brand,
          brandId: 'brand-1',
        }),
      },
      mediaTextDecision: { findFirst, upsert },
      post: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            options.posts ?? [{ description: 'Sunset yoga on the beach' }],
          ),
      },
    } as unknown as PrismaService,
    {
      getForAsset: vi
        .fn()
        .mockResolvedValue(
          options.perception === undefined ? perception() : options.perception,
        ),
    } as unknown as MediaPerceptionService,
    {
      decide,
      isProviderBound: vi.fn().mockResolvedValue(options.isBound ?? true),
    } as unknown as TypedDecisionService,
    { get: (key: string) => config[key] } as unknown as ConfigService,
    { warn: vi.fn() } as unknown as LoggerService,
  );
  return { decide, ingredientFindMany, service, upsert };
}

describe('MediaTextDecisionService', () => {
  it('judges brand safety and on-brand over the transcript, OCR and description', async () => {
    const h = makeHarness();

    await expect(h.service.evaluate(JOB)).resolves.toBe('decided');

    const [brandSafeParams, brandSafeContext] = h.decide.mock.calls[0];
    expect(brandSafeParams.state).toEqual({
      brand: { description: 'Craft cocktail bar.', name: 'Barrel' },
      contentWarnings: ['alcohol'],
      onScreenText: 'HAPPY HOUR',
      sceneSummary: 'A bartender mixes a cocktail.',
      transcript: 'Two for one tonight.',
    });
    expect(brandSafeContext).toEqual(
      expect.objectContaining({
        brandId: 'brand-1',
        decisionPoint: 'media_text.is_brand_safe',
        mode: 'live',
        organizationId: 'org-1',
        timeoutMs: 15_000,
      }),
    );
    expect(h.decide.mock.calls[1][1].decisionPoint).toBe(
      'media_text.is_on_brand',
    );
    expect(h.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({
        decisions: [
          {
            confidence: 0.93,
            name: 'isBrandSafe',
            source: 'transcript',
            value: false,
          },
          {
            confidence: 0.93,
            name: 'isOnBrand',
            source: 'transcript',
            value: false,
          },
        ],
        subjectKey: 'asset',
      }),
    );
  });

  it('judges each posted caption against the scene description', async () => {
    const h = makeHarness();

    await h.service.evaluate(JOB);

    const [params, context] = h.decide.mock.calls[2];
    expect(context.decisionPoint).toBe('media_text.is_caption_consistent');
    expect(params.state).toEqual({
      caption: 'Sunset yoga on the beach',
      sceneSummary: 'A bartender mixes a cocktail.',
      subjects: ['bartender'],
      textOnScreen: 'HAPPY HOUR',
    });
    expect(h.upsert.mock.calls[1][0].create.subjectKey).toBe(
      captionSubjectKey('Sunset yoga on the beach'),
    );
  });

  it.each([
    ['the mode is off', { mode: 'off' }],
    ['no provider is bound', { isBound: false }],
    [
      'perception is pending',
      { perception: perception({ transcriptStatus: 'pending' }) },
    ],
  ])('skips when %s', async (_label, options) => {
    const h = makeHarness(options);

    await expect(h.service.evaluate(JOB)).resolves.toBe('skipped');
    expect(h.decide).not.toHaveBeenCalled();
  });

  it('does not decide twice for the same bytes and subject', async () => {
    const h = makeHarness({ existing: true });

    await expect(h.service.evaluate(JOB)).resolves.toBe('skipped');
    expect(h.decide).not.toHaveBeenCalled();
  });

  it('persists nothing and throws for a backed-off retry when the provider does not answer', async () => {
    const h = makeHarness({ posts: [] });
    h.decide.mockResolvedValue(null);

    await expect(h.service.evaluate(JOB)).rejects.toBeInstanceOf(
      MediaTextDecisionUnansweredError,
    );

    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('persists no caption row when the caption decision fails', async () => {
    const h = makeHarness();
    h.decide
      .mockResolvedValueOnce({ confidence: 0.9, value: true })
      .mockResolvedValueOnce({ confidence: 0.9, value: true })
      .mockResolvedValueOnce(null);

    await expect(h.service.evaluate(JOB)).rejects.toBeInstanceOf(
      MediaTextDecisionUnansweredError,
    );

    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].create.subjectKey).toBe('asset');
  });

  it.each([
    ['transcript', { transcriptStatus: 'failed' }],
    ['OCR', { ocrStatus: 'failed' }],
    ['description', { description: null, descriptionStatus: 'failed' }],
  ] as const)(
    'never judges the asset when its %s failed',
    async (_label, overrides) => {
      const h = makeHarness({
        perception: perception(overrides as Partial<IMediaPerception>),
        posts: [],
      });

      await expect(h.service.evaluate(JOB)).resolves.toBe('skipped');

      expect(h.decide).not.toHaveBeenCalled();
      expect(h.upsert).not.toHaveBeenCalled();
    },
  );

  it('sweeps only perceptions the asset questions can be judged over', async () => {
    const h = makeHarness();

    await h.service.findUndecidedAssets(new Date(0), 50);

    const [undecided, recentlyPosted] = h.ingredientFindMany.mock.calls;
    expect(undecided[0].where.mediaPerceptions.some).toEqual(
      expect.objectContaining({
        descriptionStatus: { notIn: ['failed', 'pending'] },
        framesStatus: { not: 'pending' },
        ocrStatus: { notIn: ['failed', 'pending'] },
        transcriptStatus: { notIn: ['failed', 'pending'] },
      }),
    );
    expect(recentlyPosted[0].where.mediaPerceptions.some).toEqual({
      descriptionStatus: 'ready',
      isDeleted: false,
    });
  });

  it('does not ask on-brand without a brand description', async () => {
    const h = makeHarness({ brand: null, posts: [] });

    await expect(h.service.evaluate(JOB)).resolves.toBe('decided');

    expect(h.decide).toHaveBeenCalledTimes(1);
    expect(h.decide.mock.calls[0][1].decisionPoint).toBe(
      'media_text.is_brand_safe',
    );
  });

  it('keeps no partial asset row when only one question is answered', async () => {
    const h = makeHarness({ posts: [] });
    h.decide.mockResolvedValueOnce(null);

    await expect(h.service.evaluate(JOB)).rejects.toBeInstanceOf(
      MediaTextDecisionUnansweredError,
    );

    expect(h.upsert).not.toHaveBeenCalled();
  });
});

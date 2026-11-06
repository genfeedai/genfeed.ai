import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import type { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import {
  MAX_VISION_ATTEMPTS,
  MediaVisionEvaluationService,
  pickEvenly,
} from '@api/services/media-assessment/media-vision-evaluation.service';
import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import { EvaluationSeverity, EvaluationType } from '@genfeedai/contracts';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import type {
  IMediaPerception,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';

const JOB = { ingredientId: 'asset-1', organizationId: 'org-1' };
const ASSET_HASH = 'd'.repeat(64);

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Prisma `where` over scalar columns and `{ not }`. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value !== null && typeof value === 'object' && 'not' in value) {
      return row[key] !== value.not;
    }
    return row[key] === value;
  });
}

/** Prisma `data` with scalar sets and `{ increment }`. */
function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    row[key] =
      value !== null && typeof value === 'object' && 'increment' in value
        ? (row[key] as number) + (value.increment as number)
        : value;
  }
}

function frames(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    height: 10,
    index,
    storageKey: `k${index}`,
    timestampSeconds: index,
    url: `https://cdn/f${index}.jpg`,
    width: 10,
  }));
}

const perceptionRow = (overrides: Row = {}): Row => ({
  assetHash: ASSET_HASH,
  id: 'perception-1',
  ingredientId: 'asset-1',
  isDeleted: false,
  organizationId: 'org-1',
  visionAttempts: 0,
  visionEvaluationId: null,
  ...overrides,
});

const evaluationRow = (overrides: Row = {}): Row => ({
  id: 'evaluation-0',
  isDeleted: false,
  organizationId: 'org-1',
  ...overrides,
});

/**
 * In-memory media_perceptions, evaluations and ingredients tables, a perceived
 * asset, the vision scorer and the operator vision-gate mode. Frames sent to
 * the paid scorer are recorded.
 */
function makeHarness(
  options: {
    evaluations?: Row[];
    mode?: TypedDecisionMode;
    perception?: Partial<IMediaPerception>;
    perceptions?: Row[];
    scorerError?: Error;
  } = {},
) {
  const perceptions = options.perceptions ?? [perceptionRow()];
  const evaluations = options.evaluations ?? [];
  const ingredients: Row[] = [
    {
      brandId: 'brand-1',
      category: 'VIDEO',
      id: 'asset-1',
      isDeleted: false,
      organization: { userId: 'owner-1' },
      organizationId: 'org-1',
      userId: null,
    },
  ];
  const scored: { brandId: unknown; imageUrls: string[] }[] = [];
  const perception = {
    assetHash: ASSET_HASH,
    frames: frames(6),
    framesStatus: 'ready',
    kind: 'video',
    ...options.perception,
  } as IMediaPerception;
  const findFirst =
    (rows: Row[]) =>
    async ({ where }: { where: Where }) =>
      rows.find((row) => matches(row, where)) ?? null;
  const prisma = {
    evaluation: {
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: `evaluation-${evaluations.length + 1}`,
          isDeleted: false,
          ...data,
        };
        evaluations.push(row);
        return { id: row.id };
      },
      findFirst: findFirst(evaluations),
    },
    ingredient: { findFirst: findFirst(ingredients) },
    mediaPerception: {
      findFirst: findFirst(perceptions),
      updateMany: async ({ data, where }: { data: Row; where: Where }) => {
        const hit = perceptions.filter((row) => matches(row, where));
        for (const row of hit) apply(row, data);
        return { count: hit.length };
      },
    },
  };
  const scorer = {
    scoreVisionFrames: async (input: {
      brandId: unknown;
      imageUrls: string[];
      organizationId: string;
    }) => {
      if (options.scorerError) throw options.scorerError;
      scored.push({ brandId: input.brandId, imageUrls: input.imageUrls });
      return {
        feedback: ['Hands are distorted.'],
        rubric: {
          artifactLevel: 'severe',
          brandReadiness: 'needs_polish',
          compositionQuality: 'acceptable',
          hookStrength: 'moderate',
        },
        score: 4,
        suggestions: ['Regenerate.'],
      };
    },
  };
  const silent = () => undefined;
  const service = new MediaVisionEvaluationService(
    prisma as unknown as PrismaService,
    {
      getForAsset: async () => perception,
    } as unknown as MediaPerceptionService,
    scorer as unknown as ContentQualityScorerService,
    {
      getFeatureSettings: async () => ({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        mediaGateVisionMode: options.mode ?? 'live',
      }),
    } as unknown as PlatformSettingsService,
    { log: silent, warn: silent } as unknown as LoggerService,
  );
  return { evaluations, perceptions, scored, service };
}

const ownRow = (rows: Row[]) => rows.find((row) => row.id === 'perception-1');

describe('MediaVisionEvaluationService', () => {
  it('scores up to four frames and persists typed flags on a pre-publication evaluation', async () => {
    const h = makeHarness();

    await expect(h.service.evaluate(JOB)).resolves.toBe('evaluated');

    expect(h.scored).toEqual([
      {
        brandId: 'brand-1',
        imageUrls: [
          'https://cdn/f0.jpg',
          'https://cdn/f2.jpg',
          'https://cdn/f3.jpg',
          'https://cdn/f5.jpg',
        ],
      },
    ]);
    expect(h.evaluations).toEqual([
      expect.objectContaining({
        contentId: 'asset-1',
        contentType: 'VIDEO',
        data: expect.objectContaining({
          evaluationType: EvaluationType.PRE_PUBLICATION,
          flags: {
            isFlagged: true,
            reasons: ['severe_artifacts', 'needs_brand_polish'],
            severity: EvaluationSeverity.CRITICAL,
          },
          overallScore: 4,
        }),
        id: 'evaluation-1',
        organizationId: 'org-1',
        userId: 'owner-1',
      }),
    ]);
    expect(ownRow(h.perceptions)?.visionEvaluationId).toBe('evaluation-1');
  });

  it('does nothing when the vision gate is off', async () => {
    const h = makeHarness({ mode: 'off' });

    await expect(h.service.evaluate(JOB)).resolves.toBe('skipped');
    expect(h.scored).toEqual([]);
    expect(h.evaluations).toEqual([]);
  });

  it.each([
    ['already linked', perceptionRow({ visionEvaluationId: 'evaluation-9' })],
    [
      'out of paid attempts',
      perceptionRow({ visionAttempts: MAX_VISION_ATTEMPTS }),
    ],
    ['deleted', perceptionRow({ isDeleted: true })],
    ['in another organization', perceptionRow({ organizationId: 'org-2' })],
  ])('skips a perception that is %s', async (_name, row) => {
    const h = makeHarness({ perceptions: [row] });

    await expect(h.service.evaluate(JOB)).resolves.toBe('skipped');
    expect(h.scored).toEqual([]);
  });

  it('reuses the evaluation of identical bytes only when it still exists (#5316)', async () => {
    const h = makeHarness({
      evaluations: [evaluationRow()],
      perceptions: [
        perceptionRow(),
        perceptionRow({
          id: 'sibling-perception-1',
          ingredientId: 'asset-2',
          visionEvaluationId: 'evaluation-0',
        }),
      ],
    });

    await expect(h.service.evaluate(JOB)).resolves.toBe('reused');
    expect(h.scored).toEqual([]);
    expect(h.evaluations).toHaveLength(1);
    expect(ownRow(h.perceptions)?.visionEvaluationId).toBe('evaluation-0');
  });

  it.each([
    ['deleted', evaluationRow({ isDeleted: true })],
    ['in another organization', evaluationRow({ organizationId: 'org-2' })],
  ])(
    'does not reuse a sibling evaluation that is %s, clears the dangling link, and scores fresh (#5316)',
    async (_name, gone) => {
      const h = makeHarness({
        evaluations: [{ ...gone, id: 'evaluation-gone' }],
        perceptions: [
          perceptionRow(),
          perceptionRow({
            id: 'sibling-perception-1',
            ingredientId: 'asset-2',
            visionEvaluationId: 'evaluation-gone',
          }),
        ],
      });

      await expect(h.service.evaluate(JOB)).resolves.toBe('evaluated');
      expect(h.scored).toHaveLength(1);
      // The sibling re-enters findUnevaluatedAssets instead of staying
      // invisibly linked to a result that no longer exists.
      expect(h.perceptions.map((row) => row.visionEvaluationId)).toEqual([
        'evaluation-2',
        null,
      ]);
    },
  );

  it('records a failed paid attempt instead of throwing', async () => {
    const h = makeHarness({ scorerError: new Error('refused') });

    await expect(h.service.evaluate(JOB)).resolves.toBe('failed');
    expect(ownRow(h.perceptions)).toMatchObject({
      visionAttempts: 1,
      visionEvaluationId: null,
    });
    expect(h.evaluations).toEqual([]);
  });

  it('waits for frames', async () => {
    const h = makeHarness({ perception: { framesStatus: 'pending' } });

    await expect(h.service.evaluate(JOB)).resolves.toBe('skipped');
    expect(h.scored).toEqual([]);
  });
});

describe('pickEvenly', () => {
  it.each([
    [[0, 1, 2, 3, 4, 5, 6, 7, 8], 3, [0, 4, 8]],
    [[1, 2], 4, [1, 2]],
  ])('picks from %j at most %i: %j', (items, max, expected) => {
    expect(pickEvenly(items, max)).toEqual(expected);
  });
});

import type { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import {
  MediaVisionEvaluationService,
  pickEvenly,
} from '@api/services/media-assessment/media-vision-evaluation.service';
import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import { EvaluationSeverity, EvaluationType } from '@genfeedai/contracts';
import type { IMediaPerception } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';

const JOB = { ingredientId: 'asset-1', organizationId: 'org-1' };

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

function makeHarness(
  options: {
    mode?: string;
    perception?: Partial<IMediaPerception> | null;
    sibling?: { visionEvaluationId: string } | null;
  } = {},
) {
  const perception =
    options.perception === null
      ? null
      : ({
          assetHash: 'd'.repeat(64),
          frames: frames(6),
          framesStatus: 'ready',
          kind: 'video',
          ...options.perception,
        } as IMediaPerception);
  const perceptionFindFirst = vi
    .fn()
    .mockResolvedValueOnce({ id: 'perception-1', visionEvaluationId: null })
    .mockResolvedValueOnce(options.sibling ?? null);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const evaluationCreate = vi.fn().mockResolvedValue({ id: 'evaluation-1' });
  const scoreVisionFrames = vi.fn().mockResolvedValue({
    feedback: ['Hands are distorted.'],
    rubric: {
      artifactLevel: 'severe',
      brandReadiness: 'needs_polish',
      compositionQuality: 'acceptable',
      hookStrength: 'moderate',
    },
    score: 4,
    suggestions: ['Regenerate.'],
  });
  const logger = { log: vi.fn() };
  const service = new MediaVisionEvaluationService(
    {
      evaluation: { create: evaluationCreate },
      ingredient: {
        findFirst: vi.fn().mockResolvedValue({
          brandId: 'brand-1',
          category: 'VIDEO',
          organization: { userId: 'owner-1' },
          userId: null,
        }),
      },
      mediaPerception: { findFirst: perceptionFindFirst, updateMany },
    } as unknown as PrismaService,
    {
      getForAsset: vi.fn().mockResolvedValue(perception),
    } as unknown as MediaPerceptionService,
    { scoreVisionFrames } as unknown as ContentQualityScorerService,
    {
      get: () => options.mode ?? 'live',
    } as unknown as ConfigService,
    logger as unknown as LoggerService,
  );
  return { evaluationCreate, scoreVisionFrames, service, updateMany };
}

describe('MediaVisionEvaluationService', () => {
  it('scores up to four frames and persists typed flags on a pre-publication evaluation', async () => {
    const h = makeHarness();

    await expect(h.service.evaluate(JOB)).resolves.toBe('evaluated');

    expect(h.scoreVisionFrames).toHaveBeenCalledWith({
      brandId: 'brand-1',
      imageUrls: [
        'https://cdn/f0.jpg',
        'https://cdn/f2.jpg',
        'https://cdn/f3.jpg',
        'https://cdn/f5.jpg',
      ],
      organizationId: 'org-1',
    });
    const { data } = h.evaluationCreate.mock.calls[0][0];
    expect(data).toEqual(
      expect.objectContaining({
        contentId: 'asset-1',
        contentType: 'VIDEO',
        organizationId: 'org-1',
        userId: 'owner-1',
      }),
    );
    expect(data.data).toEqual(
      expect.objectContaining({
        evaluationType: EvaluationType.PRE_PUBLICATION,
        flags: {
          isFlagged: true,
          reasons: ['severe_artifacts', 'needs_brand_polish'],
          severity: EvaluationSeverity.CRITICAL,
        },
        overallScore: 4,
      }),
    );
    expect(h.updateMany).toHaveBeenCalledWith({
      data: { visionEvaluationId: 'evaluation-1' },
      where: { id: 'perception-1', isDeleted: false, organizationId: 'org-1' },
    });
  });

  it('does nothing when the vision gate is off', async () => {
    const h = makeHarness({ mode: 'off' });

    await expect(h.service.evaluate(JOB)).resolves.toBe('skipped');
    expect(h.scoreVisionFrames).not.toHaveBeenCalled();
  });

  it('reuses the evaluation of identical bytes', async () => {
    const h = makeHarness({ sibling: { visionEvaluationId: 'evaluation-0' } });

    await expect(h.service.evaluate(JOB)).resolves.toBe('reused');
    expect(h.scoreVisionFrames).not.toHaveBeenCalled();
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { visionEvaluationId: 'evaluation-0' } }),
    );
  });

  it('waits for frames', async () => {
    const h = makeHarness({ perception: { framesStatus: 'pending' } });

    await expect(h.service.evaluate(JOB)).resolves.toBe('skipped');
  });
});

describe('pickEvenly', () => {
  it('keeps first and last and spreads the rest', () => {
    expect(pickEvenly([0, 1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual([0, 4, 8]);
    expect(pickEvenly([1, 2], 4)).toEqual([1, 2]);
  });
});

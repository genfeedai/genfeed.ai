import {
  BREAKOUT_VISUAL_QUALITY_KEY,
  type BreakoutQualityBinding,
  breakoutVisualEvidenceMeetsPolicy,
  DEFAULT_BREAKOUT_MIN_VISUAL_SCORE,
  readBreakoutVisualEvidence,
} from '@api/collections/outliers/services/breakout-visual-quality.util';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const binding: BreakoutQualityBinding = {
  responseId: 'response-a',
  outputId: 'output-a',
  postId: 'post-a',
  strategyId: 'strategy-a',
  workflowExecutionId: 'execution-a',
  materialHash: 'sha256:material',
};

function client(rows: Array<{ index: number; score: unknown }>) {
  const findMany = vi.fn(async () =>
    rows.map(({ index, score }) => ({
      id: `score-${index}`,
      data: {
        [BREAKOUT_VISUAL_QUALITY_KEY]: { ...binding, partIndex: index },
        overallScore: score,
      },
    })),
  );
  return {
    findMany,
    client: { contentScore: { findMany } } as unknown as Pick<
      Prisma.TransactionClient,
      'contentScore'
    >,
  };
}

describe('retained visual evidence', () => {
  it('reads one score per attached visual bound to exactly this material', async () => {
    const h = client([
      { index: 0, score: 80 },
      { index: 1, score: 90 },
    ]);
    const evidence = await readBreakoutVisualEvidence(
      h.client,
      'org-a',
      binding,
      2,
    );
    expect(evidence).toEqual({ scores: [80, 90], isComplete: true });
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-a',
          isDeleted: false,
          OR: [0, 1].map((partIndex) => ({
            data: {
              path: [BREAKOUT_VISUAL_QUALITY_KEY],
              equals: { ...binding, partIndex },
            },
          })),
        },
      }),
    );
  });

  it('is incomplete while any visual lacks a valid retained score', async () => {
    expect(
      await readBreakoutVisualEvidence(
        client([{ index: 0, score: 80 }]).client,
        'org-a',
        binding,
        2,
      ),
    ).toEqual({ scores: [80, null], isComplete: false });
    for (const score of [Number.NaN, -1, 101, '90', null])
      expect(
        (
          await readBreakoutVisualEvidence(
            client([{ index: 0, score }]).client,
            'org-a',
            binding,
            1,
          )
        ).isComplete,
      ).toBe(false);
  });

  it('has no evidence for a post without visuals', async () => {
    const h = client([]);
    expect(
      await readBreakoutVisualEvidence(h.client, 'org-a', binding, 0),
    ).toEqual({ scores: [], isComplete: false });
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('requires every visual to reach the configured bar, defaulting to the product’s image bar', () => {
    const evidence = { scores: [80, 74], isComplete: true } as const;
    expect(DEFAULT_BREAKOUT_MIN_VISUAL_SCORE).toBe(75);
    expect(breakoutVisualEvidenceMeetsPolicy(evidence, undefined)).toBe(false);
    expect(breakoutVisualEvidenceMeetsPolicy(evidence, 70)).toBe(true);
    expect(breakoutVisualEvidenceMeetsPolicy(evidence, 101)).toBe(false);
    expect(
      breakoutVisualEvidenceMeetsPolicy(
        { scores: [90, null], isComplete: false },
        0,
      ),
    ).toBe(false);
  });
});

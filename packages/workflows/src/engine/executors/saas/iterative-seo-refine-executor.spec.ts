import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createIterativeSeoRefineExecutor,
  type IterativeSeoRefineExecutor,
  type IterativeSeoRefineOutput,
} from '@workflow-engine/executors/saas/iterative-seo-refine-executor';
import type { SeoRewriteResolver } from '@workflow-engine/executors/saas/seo-rewrite-executor';
import type { SeoScoreResolver } from '@workflow-engine/executors/saas/seo-score-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  upstream?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'refine-1',
    inputs: [],
    label: 'Iterative SEO Refine',
    type: 'iterativeSeoRefine',
  };
  const inputs = new Map<string, unknown>();
  if (upstream !== undefined) {
    inputs.set('in', upstream);
  }
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

/** Score resolver that returns the next score from a queue on each call. */
function scoreSequence(scores: number[]): ReturnType<typeof vi.fn> {
  let call = 0;
  return vi.fn().mockImplementation(async () => {
    const score = scores[Math.min(call, scores.length - 1)] ?? 0;
    call += 1;
    return {
      breakdown: { keywordPlacement: score / 4 },
      rating: score >= 80 ? 'good' : 'needs_work',
      score,
      suggestions: ['improve'],
    };
  });
}

describe('IterativeSeoRefineExecutor', () => {
  let executor: IterativeSeoRefineExecutor;
  let rewrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executor = createIterativeSeoRefineExecutor();
    rewrite = vi
      .fn()
      .mockImplementation(async () => ({ model: 'm', text: 'rewritten body' }));
    executor.setRewriteResolver(rewrite as unknown as SeoRewriteResolver);
  });

  it('throws when resolvers are not configured', async () => {
    const fresh = createIterativeSeoRefineExecutor();
    await expect(fresh.execute(makeInput({ content: 'x' }))).rejects.toThrow(
      'Iterative SEO refine resolvers not configured',
    );
  });

  it('throws when content is missing', async () => {
    executor.setScoreResolver(
      scoreSequence([90]) as unknown as SeoScoreResolver,
    );
    await expect(executor.execute(makeInput({}))).rejects.toThrow(
      'Missing required input: content',
    );
  });

  it('returns immediately with zero rewrites when the input already passes', async () => {
    const score = scoreSequence([85]);
    executor.setScoreResolver(score as unknown as SeoScoreResolver);

    const result = await executor.execute(
      makeInput({ targetScore: 80 }, { content: '<p>good</p>' }),
    );
    const data = result.data as IterativeSeoRefineOutput;

    expect(data.converged).toBe(true);
    expect(data.iterations).toBe(0);
    expect(data.score).toBe(85);
    expect(data.text).toBe('<p>good</p>');
    expect(rewrite).not.toHaveBeenCalled();
    expect(data.history).toEqual([
      { iteration: 0, rewritten: false, score: 85 },
    ]);
  });

  it('rewrites and re-scores until the target score is reached', async () => {
    // initial 50 -> rewrite -> 70 -> rewrite -> 82 (converges on 2nd pass)
    const score = scoreSequence([50, 70, 82]);
    executor.setScoreResolver(score as unknown as SeoScoreResolver);

    const result = await executor.execute(
      makeInput(
        { maxIterations: 5, targetScore: 80 },
        { content: '<p>weak</p>', targetKeyword: 'kw', title: 'T' },
      ),
    );
    const data = result.data as IterativeSeoRefineOutput;

    expect(data.converged).toBe(true);
    expect(data.iterations).toBe(2);
    expect(data.score).toBe(82);
    expect(data.text).toBe('rewritten body');
    expect(rewrite).toHaveBeenCalledTimes(2);
    expect(score).toHaveBeenCalledTimes(3);
    expect(data.history).toEqual([
      { iteration: 0, rewritten: false, score: 50 },
      { iteration: 1, rewritten: true, score: 70 },
      { iteration: 2, rewritten: true, score: 82 },
    ]);
  });

  it('stops at maxIterations without converging when the target is never met', async () => {
    const score = scoreSequence([10, 20, 30]);
    executor.setScoreResolver(score as unknown as SeoScoreResolver);

    const result = await executor.execute(
      makeInput({ maxIterations: 2, targetScore: 90 }, { content: 'low' }),
    );
    const data = result.data as IterativeSeoRefineOutput;

    expect(data.converged).toBe(false);
    expect(data.iterations).toBe(2);
    expect(rewrite).toHaveBeenCalledTimes(2);
    expect(data.history).toHaveLength(3);
  });

  it('forwards the latest suggestions into each rewrite call', async () => {
    executor.setScoreResolver(
      scoreSequence([40, 95]) as unknown as SeoScoreResolver,
    );
    await executor.execute(makeInput({ targetScore: 80 }, { content: 'body' }));
    expect(rewrite).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'body',
        suggestions: ['improve'],
      }),
    );
  });

  it('stops refining when the rewrite resolver returns empty content', async () => {
    executor.setScoreResolver(
      scoreSequence([40, 40, 40]) as unknown as SeoScoreResolver,
    );
    rewrite.mockResolvedValueOnce({ model: 'm', text: '' });

    const result = await executor.execute(
      makeInput({ maxIterations: 3, targetScore: 80 }, { content: 'body' }),
    );
    const data = result.data as IterativeSeoRefineOutput;

    expect(data.iterations).toBe(0);
    expect(data.text).toBe('body');
    expect(data.converged).toBe(false);
    expect(rewrite).toHaveBeenCalledTimes(1);
  });

  it('reads content from a ConditionResult passthrough', async () => {
    executor.setScoreResolver(
      scoreSequence([95]) as unknown as SeoScoreResolver,
    );
    const result = await executor.execute(
      makeInput(
        { targetScore: 80 },
        {
          actualValue: 60,
          data: { content: '<p>from condition</p>' },
          operator: 'greaterThanOrEquals',
          result: false,
        },
      ),
    );
    expect((result.data as IterativeSeoRefineOutput).text).toBe(
      '<p>from condition</p>',
    );
  });

  describe('validate', () => {
    it('rejects out-of-range targetScore and maxIterations', () => {
      const node: ExecutableNode = {
        config: { maxIterations: 99, targetScore: 150 },
        id: 'r',
        inputs: [],
        label: 'R',
        type: 'iterativeSeoRefine',
      };
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('targetScore must be between 0 and 100');
      expect(result.errors).toContain('maxIterations must be between 1 and 10');
    });
  });

  it('estimates cost proportional to maxIterations (initial score + iterations)', () => {
    const node: ExecutableNode = {
      config: { maxIterations: 3 },
      id: 'r',
      inputs: [],
      label: 'R',
      type: 'iterativeSeoRefine',
    };
    // 2 (initial score) + 3 × 5 (score + rewrite per iteration) = 17
    expect(executor.estimateCost(node)).toBe(17);
  });

  it('returns the best-scoring candidate, not the last, when a rewrite lowers the score', async () => {
    // Scores: initial=60, after rewrite-1=80 (best), after rewrite-2=50 (regression)
    const score = scoreSequence([60, 80, 50]);
    executor.setScoreResolver(score as unknown as SeoScoreResolver);

    let rewriteCall = 0;
    rewrite.mockImplementation(async () => {
      rewriteCall += 1;
      return {
        model: 'm',
        text: rewriteCall === 1 ? 'best body' : 'worse body',
      };
    });

    const result = await executor.execute(
      makeInput(
        { maxIterations: 3, targetScore: 90 },
        { content: 'original body' },
      ),
    );
    const data = result.data as IterativeSeoRefineOutput;

    // Should return the best candidate (score 80, after first rewrite), not the last (50)
    expect(data.score).toBe(80);
    expect(data.text).toBe('best body');
    expect(data.converged).toBe(false);
    // History still records all iterations
    expect(data.history).toHaveLength(4); // initial + 3 rewrites (loop runs until maxIterations)
  });
});

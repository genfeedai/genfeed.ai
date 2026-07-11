import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createSeoScoreExecutor,
  type SeoScoreExecutor,
  type SeoScoreOutput,
  type SeoScoreResolver,
} from '@workflow-engine/executors/saas/seo-score-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  upstream?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'seo-score-1',
    inputs: [],
    label: 'SEO Score',
    type: 'seoScore',
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

describe('SeoScoreExecutor', () => {
  let executor: SeoScoreExecutor;
  let resolver: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executor = createSeoScoreExecutor();
    resolver = vi.fn().mockResolvedValue({
      breakdown: { keywordPlacement: 12 },
      rating: 'needs_work',
      score: 64,
      suggestions: ['Add the target keyword to the title'],
    });
    executor.setResolver(resolver as unknown as SeoScoreResolver);
  });

  it('throws when no resolver is configured', async () => {
    const fresh = createSeoScoreExecutor();
    await expect(fresh.execute(makeInput({}))).rejects.toThrow(
      'SEO score resolver not configured',
    );
  });

  it('surfaces score at the top level for downstream condition nodes', async () => {
    const result = await executor.execute(
      makeInput(
        {},
        {
          content: '<p>body</p>',
          targetKeyword: 'ai workflows',
          title: 'My Title',
        },
      ),
    );
    const data = result.data as SeoScoreOutput;
    expect(data.score).toBe(64);
    expect(data.suggestions).toEqual(['Add the target keyword to the title']);
    expect(data.content).toBe('<p>body</p>');
    expect(data.title).toBe('My Title');
    expect(data.targetKeyword).toBe('ai workflows');
    expect(result.metadata?.score).toBe(64);
  });

  it('builds scorable content from upstream output and defaults useLlm to true', async () => {
    await executor.execute(
      makeInput(
        {},
        { content: '<p>body</p>', targetKeyword: 'kw', title: 'T' },
      ),
    );
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          content: '<p>body</p>',
          targetKeyword: 'kw',
          title: 'T',
        }),
        organizationId: 'org-1',
        useLlm: true,
      }),
    );
  });

  it('falls back to node config and forwards useLlm:false', async () => {
    await executor.execute(
      makeInput({
        content: '<p>from config</p>',
        targetKeyword: 'cfg-kw',
        useLlm: false,
      }),
    );
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          content: '<p>from config</p>',
          targetKeyword: 'cfg-kw',
        }),
        useLlm: false,
      }),
    );
  });

  it('defaults suggestions to an empty array when the resolver omits them', async () => {
    resolver.mockResolvedValueOnce({ score: 90 });
    const result = await executor.execute(makeInput({ content: 'x' }));
    expect((result.data as SeoScoreOutput).suggestions).toEqual([]);
  });

  it('unwraps a ConditionResult passthrough when placed downstream of a condition', async () => {
    // A `condition` node forwards its inbound payload under `.data`.
    await executor.execute(
      makeInput(
        {},
        {
          actualValue: 60,
          data: { content: '<p>via condition</p>', targetKeyword: 'kw' },
          operator: 'greaterThanOrEquals',
          result: false,
        },
      ),
    );
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          content: '<p>via condition</p>',
          targetKeyword: 'kw',
        }),
      }),
    );
  });

  it('estimates a flat cost', () => {
    const node = {
      config: {},
      id: 's',
      inputs: [],
      label: 'S',
      type: 'seoScore',
    };
    expect(executor.estimateCost(node)).toBe(2);
  });
});

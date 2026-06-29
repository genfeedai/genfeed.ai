import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createSeoRewriteExecutor,
  type SeoRewriteExecutor,
  type SeoRewriteOutput,
  type SeoRewriteResolver,
} from '@workflow-engine/executors/saas/seo-rewrite-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  upstream?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'seo-rewrite-1',
    inputs: [],
    label: 'SEO Rewrite',
    type: 'seoRewrite',
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

describe('SeoRewriteExecutor', () => {
  let executor: SeoRewriteExecutor;
  let resolver: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executor = createSeoRewriteExecutor();
    resolver = vi
      .fn()
      .mockResolvedValue({ model: 'openai/gpt-4o-mini', text: 'rewritten' });
    executor.setResolver(resolver as unknown as SeoRewriteResolver);
  });

  it('throws when no resolver is configured', async () => {
    const fresh = createSeoRewriteExecutor();
    await expect(fresh.execute(makeInput({ content: 'x' }))).rejects.toThrow(
      'SEO rewrite resolver not configured',
    );
  });

  it('throws when content is missing', async () => {
    await expect(executor.execute(makeInput({}))).rejects.toThrow(
      'Missing required input: content',
    );
  });

  it('rewrites content using upstream seoScore output', async () => {
    const result = await executor.execute(
      makeInput(
        {},
        {
          content: '<p>original</p>',
          suggestions: ['Add an H2', 'Shorten sentences'],
          targetKeyword: 'kw',
          title: 'Title',
        },
      ),
    );
    const data = result.data as SeoRewriteOutput;
    expect(data.text).toBe('rewritten');
    expect(data.model).toBe('openai/gpt-4o-mini');
    expect(data.appliedSuggestions).toEqual(['Add an H2', 'Shorten sentences']);
    expect(data.title).toBe('Title');
    expect(data.targetKeyword).toBe('kw');
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '<p>original</p>',
        organizationId: 'org-1',
        suggestions: ['Add an H2', 'Shorten sentences'],
        targetKeyword: 'kw',
        title: 'Title',
      }),
    );
  });

  it('defaults model to null and suggestions to empty when absent', async () => {
    resolver.mockResolvedValueOnce({ text: 'done' });
    const result = await executor.execute(makeInput({ content: 'body' }));
    const data = result.data as SeoRewriteOutput;
    expect(data.model).toBeNull();
    expect(data.appliedSuggestions).toEqual([]);
  });

  it('reads content from a ConditionResult passthrough (downstream of a condition)', async () => {
    await executor.execute(
      makeInput(
        {},
        {
          actualValue: 60,
          data: {
            content: '<p>real content</p>',
            suggestions: ['Add an H2'],
            targetKeyword: 'kw',
          },
          operator: 'greaterThanOrEquals',
          result: false,
        },
      ),
    );
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '<p>real content</p>',
        suggestions: ['Add an H2'],
        targetKeyword: 'kw',
      }),
    );
  });

  it('estimates a flat cost', () => {
    const node = {
      config: {},
      id: 'r',
      inputs: [],
      label: 'R',
      type: 'seoRewrite',
    };
    expect(executor.estimateCost(node)).toBe(3);
  });
});

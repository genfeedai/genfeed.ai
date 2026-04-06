import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createKeywordTriggerExecutor,
  type KeywordChecker,
  type KeywordTriggerExecutor,
} from '@workflow-engine/executors/saas/keyword-trigger-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(config: Record<string, unknown>): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'trigger-1',
    inputs: [],
    label: 'Keyword Trigger',
    type: 'keywordTrigger',
  };
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs: new Map(), node };
}

describe('KeywordTriggerExecutor', () => {
  let executor: KeywordTriggerExecutor;
  let mockChecker: KeywordChecker;

  beforeEach(() => {
    executor = createKeywordTriggerExecutor();
    mockChecker = vi.fn().mockResolvedValue({
      authorId: 'a-1',
      authorUsername: 'poster',
      detectedAt: '2026-02-22T20:00:00Z',
      matchedKeyword: 'genfeed',
      platform: 'twitter',
      postId: 'post-1',
      postUrl: 'https://x.com/poster/status/post-1',
      text: 'Check out genfeed for social automation!',
    });
    executor.setChecker(mockChecker);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('keywordTrigger');
  });

  it('throws if checker not configured', async () => {
    const fresh = createKeywordTriggerExecutor();
    const input = makeInput({ keywords: ['genfeed'], platform: 'twitter' });
    await expect(fresh.execute(input)).rejects.toThrow(
      'checker not configured',
    );
  });

  it('returns keyword match data when matched', async () => {
    const input = makeInput({ keywords: ['genfeed'], platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({
      matched: true,
      matchedKeyword: 'genfeed',
      postId: 'post-1',
    });
    expect(result.data).toMatchObject({
      matchedKeyword: 'genfeed',
      postId: 'post-1',
    });
  });

  it('returns null when no match', async () => {
    (mockChecker as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const input = makeInput({ keywords: ['genfeed'], platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({ matched: false });
    expect(result.data).toBeNull();
  });

  it('passes keywords and match mode to checker', async () => {
    const input = makeInput({
      caseSensitive: true,
      excludeKeywords: ['spam'],
      keywords: ['genfeed', 'AI'],
      matchMode: 'exact',
      platform: 'twitter',
    });
    await executor.execute(input);
    expect(mockChecker).toHaveBeenCalledWith(
      expect.objectContaining({
        caseSensitive: true,
        excludeKeywords: ['spam'],
        keywords: ['genfeed', 'AI'],
        matchMode: 'exact',
      }),
    );
  });

  it('uses default match mode and caseSensitive', async () => {
    const input = makeInput({ keywords: ['genfeed'], platform: 'twitter' });
    await executor.execute(input);
    expect(mockChecker).toHaveBeenCalledWith(
      expect.objectContaining({
        caseSensitive: false,
        matchMode: 'contains',
      }),
    );
  });

  it('validates platform', () => {
    const node: ExecutableNode = {
      config: { keywords: ['test'], platform: 'tiktok' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'keywordTrigger',
    };
    expect(executor.validate(node).valid).toBe(false);
  });

  it('validates keywords are required', () => {
    const node: ExecutableNode = {
      config: { keywords: [], platform: 'twitter' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'keywordTrigger',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one keyword is required');
  });

  it('validates missing keywords', () => {
    const node: ExecutableNode = {
      config: { platform: 'twitter' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'keywordTrigger',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one keyword is required');
  });

  it('validates match mode', () => {
    const node: ExecutableNode = {
      config: { keywords: ['test'], matchMode: 'fuzzy', platform: 'twitter' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'keywordTrigger',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid match mode');
  });

  it('accepts valid config', () => {
    const node: ExecutableNode = {
      config: {
        keywords: ['genfeed'],
        matchMode: 'regex',
        platform: 'instagram',
      },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'keywordTrigger',
    };
    expect(executor.validate(node).valid).toBe(true);
  });

  it('estimates cost as zero', () => {
    const node: ExecutableNode = {
      config: { keywords: ['test'], platform: 'twitter' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'keywordTrigger',
    };
    expect(executor.estimateCost(node)).toBe(0);
  });
});

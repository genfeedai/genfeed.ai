import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  HookGeneratorExecutor,
  type HookGeneratorOutput,
} from '@workflow-engine/executors/saas/hook-generator-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it } from 'vitest';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: {
      hookFormula: 'curiosity_gap',
      niche: 'AI founders',
      product: 'workflow automation',
      toneStyle: 'storytelling',
      ...configOverrides,
    },
    id: 'hook-1',
    inputs: [],
    label: 'Hook Generator',
    type: 'hookGenerator',
  };
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
}

function makeInput(
  configOverrides: Record<string, unknown> = {},
  inputEntries: [string, unknown][] = [],
): ExecutorInput {
  return {
    context: makeContext(),
    inputs: new Map<string, unknown>(inputEntries),
    node: makeNode(configOverrides),
  };
}

describe('HookGeneratorExecutor', () => {
  let executor: HookGeneratorExecutor;

  beforeEach(() => {
    executor = new HookGeneratorExecutor();
  });

  describe('validate', () => {
    it('passes with valid hook settings', () => {
      const result = executor.validate(makeNode());

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails for invalid formula and tone values', () => {
      const result = executor.validate(
        makeNode({
          hookFormula: 'unsupported',
          toneStyle: 'flat',
        }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Invalid hookFormula. Must be one of: person_conflict_resolution, curiosity_gap, list_reveal, transformation, challenge',
      );
      expect(result.errors).toContain(
        'Invalid toneStyle. Must be one of: storytelling, provocative, educational, humorous, dramatic',
      );
    });

    it('fails when optional text config is blank', () => {
      const result = executor.validate(makeNode({ niche: ' ' }));

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'niche must be a non-empty string when provided',
      );
    });
  });

  describe('estimateCost', () => {
    it('returns one credit', () => {
      expect(executor.estimateCost(makeNode())).toBe(1);
    });
  });

  describe('execute', () => {
    it('emits hook text, caption hook, hashtags, and six slide prompts', async () => {
      const result = await executor.execute(
        makeInput({ hookFormula: 'challenge', toneStyle: 'dramatic' }, [
          [
            'trendData',
            {
              hashtags: ['#AIContent', 'founder tips'],
              topic: 'autonomous content loops',
            },
          ],
          ['brand', { voice: 'direct and practical' }],
        ]),
      );
      const output = result.data as HookGeneratorOutput;

      expect(output.hookText).toContain('The moment everything changed');
      expect(output.captionHook).toContain('autonomous content loops');
      expect(output.captionHook).toContain('direct and practical');
      expect(output.hashtags).toEqual([
        '#aicontent',
        '#foundertips',
        '#aifounders',
        '#workflowautomation',
        '#content',
      ]);
      expect(output.slidePrompts).toHaveLength(6);
      expect(output.slidePrompts[0]).toContain('workflow automation');
      expect(result.metadata?.formula).toBe('challenge');
      expect(result.metadata?.toneStyle).toBe('dramatic');
    });

    it('uses defaults when config and inputs are sparse', async () => {
      const result = await executor.execute(makeInput({}));
      const output = result.data as HookGeneratorOutput;

      expect(output.hookText).toContain('I tried workflow automation');
      expect(output.captionHook).toBe(output.hookText);
      expect(output.hashtags).toContain('#aifounders');
      expect(output.slidePrompts).toHaveLength(6);
    });
  });
});

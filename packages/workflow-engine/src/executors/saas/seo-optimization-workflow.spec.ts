/**
 * Composed end-to-end coverage for the SEO-optimization workflow (#761):
 * - the graph (seoScore -> condition -> seoRewrite) passes validation with no cycle,
 * - the same shape with a back-edge is rejected (CYCLE_DETECTED), proving why the
 *   iterate-until loop lives inside `iterativeSeoRefine` rather than the graph,
 * - the executors, run in dependency order, produce the score -> branch -> rewrite path.
 */
import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { ConditionExecutor } from '@workflow-engine/executors/saas/condition-executor';
import {
  createSeoRewriteExecutor,
  type SeoRewriteOutput,
  type SeoRewriteResolver,
} from '@workflow-engine/executors/saas/seo-rewrite-executor';
import {
  createSeoScoreExecutor,
  type SeoScoreOutput,
  type SeoScoreResolver,
} from '@workflow-engine/executors/saas/seo-score-executor';
import type {
  ExecutableNode,
  ExecutableWorkflow,
} from '@workflow-engine/types';
import { validateWorkflow } from '@workflow-engine/validation/workflow-validator';
import { describe, expect, it } from 'vitest';

const CONTEXT: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'wf-1',
};

function node(type: string, config: Record<string, unknown>): ExecutableNode {
  return { config, id: `${type}-1`, inputs: [], label: type, type };
}

describe('SEO optimization workflow (composed)', () => {
  it('validates seoScore -> condition -> seoRewrite as an acyclic graph', () => {
    const workflow: ExecutableWorkflow = {
      edges: [
        {
          id: 'e1',
          source: 'seoScore-1',
          sourceHandle: 'data',
          target: 'condition-1',
          targetHandle: 'data',
        },
        {
          id: 'e2',
          source: 'condition-1',
          sourceHandle: 'false',
          target: 'seoRewrite-1',
          targetHandle: 'content',
        },
      ],
      id: 'wf-seo',
      lockedNodeIds: [],
      nodes: [
        node('seoScore', {}),
        node('condition', {
          customField: 'score',
          field: 'custom',
          operator: 'greaterThanOrEquals',
          value: 80,
        }),
        node('seoRewrite', {}),
      ],
      organizationId: 'org-1',
      userId: 'user-1',
    };

    const result = validateWorkflow(workflow);
    expect(result.isValid).toBe(true);
    expect(result.errors.map((error) => error.code)).not.toContain(
      'CYCLE_DETECTED',
    );
  });

  it('rejects a score<->rewrite back-edge as a cycle', () => {
    const workflow: ExecutableWorkflow = {
      edges: [
        { id: 'e1', source: 'seoScore-1', target: 'seoRewrite-1' },
        // Back-edge: turns the iterate-until into a graph cycle.
        { id: 'e2', source: 'seoRewrite-1', target: 'seoScore-1' },
      ],
      id: 'wf-cycle',
      lockedNodeIds: [],
      nodes: [node('seoScore', {}), node('seoRewrite', {})],
      organizationId: 'org-1',
      userId: 'user-1',
    };

    const result = validateWorkflow(workflow);
    expect(result.isValid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      'CYCLE_DETECTED',
    );
  });

  it('runs score -> branch (below target) -> rewrite end to end', async () => {
    const scoreResolver: SeoScoreResolver = async () => ({
      breakdown: { keywordPlacement: 10 },
      rating: 'needs_work',
      score: 60,
      suggestions: ['Add the target keyword to the first paragraph'],
    });
    const rewriteResolver: SeoRewriteResolver = async ({ content }) => ({
      model: 'm',
      text: `improved: ${content}`,
    });

    const scoreExecutor = createSeoScoreExecutor(scoreResolver);
    const conditionExecutor = new ConditionExecutor();
    const rewriteExecutor = createSeoRewriteExecutor(rewriteResolver);

    // 1. score the content
    const scoreOut = await scoreExecutor.execute({
      context: CONTEXT,
      inputs: new Map([
        ['in', { content: '<p>thin</p>', targetKeyword: 'kw', title: 'T' }],
      ]),
      node: node('seoScore', {}),
    });
    const scoreData = scoreOut.data as SeoScoreOutput;
    expect(scoreData.score).toBe(60);

    // 2. branch on the emitted score
    const conditionOut = await conditionExecutor.execute({
      context: CONTEXT,
      inputs: new Map([['in', scoreData]]),
      node: node('condition', {
        customField: 'score',
        field: 'custom',
        operator: 'greaterThanOrEquals',
        value: 80,
      }),
    });
    expect(conditionOut.metadata?.branch).toBe('false');

    // 3. low-score branch rewrites using the upstream score output
    const rewriteOut = await rewriteExecutor.execute({
      context: CONTEXT,
      inputs: new Map([['in', scoreData]]),
      node: node('seoRewrite', {}),
    });
    const rewriteData = rewriteOut.data as SeoRewriteOutput;
    expect(rewriteData.text).toBe('improved: <p>thin</p>');
    expect(rewriteData.appliedSuggestions).toEqual([
      'Add the target keyword to the first paragraph',
    ]);
  });
});

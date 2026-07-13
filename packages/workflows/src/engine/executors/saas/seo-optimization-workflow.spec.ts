/**
 * Composed end-to-end coverage for the SEO-optimization workflow (#761):
 * - the graph (seoScore -> seoRewrite) passes validation with no cycle,
 * - the same shape with a back-edge is rejected (CYCLE_DETECTED), proving why the
 *   iterate-until loop lives inside `iterativeSeoRefine` rather than the graph,
 * - the executors, run in dependency order, produce the score -> rewrite path.
 */

import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode, ExecutableWorkflow } from '../../types';
import { validateWorkflow } from '../../validation/workflow-validator';
import {
  createSeoRewriteExecutor,
  type SeoRewriteOutput,
  type SeoRewriteResolver,
} from './seo-rewrite-executor';
import {
  createSeoScoreExecutor,
  type SeoScoreOutput,
  type SeoScoreResolver,
} from './seo-score-executor';

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
  it('validates seoScore -> seoRewrite as an acyclic graph', () => {
    const workflow: ExecutableWorkflow = {
      edges: [
        {
          id: 'e1',
          source: 'seoScore-1',
          sourceHandle: 'data',
          target: 'seoRewrite-1',
          targetHandle: 'content',
        },
      ],
      id: 'wf-seo',
      lockedNodeIds: [],
      nodes: [node('seoScore', {}), node('seoRewrite', {})],
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

  it('runs score -> rewrite end to end on a below-target score', async () => {
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

    // 2. low-score path rewrites using the upstream score output
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

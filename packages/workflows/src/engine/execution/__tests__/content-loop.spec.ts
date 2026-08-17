import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { INodeExecutor } from '../../executors/base-executor';
import {
  AnalyticsFeedbackExecutor,
  type AnalyticsFeedbackOutput,
} from '../../executors/saas/analytics-feedback-executor';
import { BrandContextExecutor } from '../../executors/saas/brand-context-executor';
import { PromptConstructorExecutor } from '../../executors/saas/prompt-constructor-executor';
import {
  PublishExecutor,
  type PublishResolver,
} from '../../executors/saas/publish-executor';
import { TrendTriggerExecutor } from '../../executors/saas/trend-trigger-executor';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
} from '../../types';
import { type NodeExecutor, WorkflowEngine } from '../engine';

/**
 * #3023 proof: the content-loop template graph — analytics-feedback → trend
 * trigger → prompt constructor → llm → publish — actually resolves every
 * wired handle end to end, using the same canonical node types and edge
 * shapes as `CONTENT_LOOP_TEMPLATE` (post `NODE_TYPE_TO_EXECUTOR`
 * conversion). topHooks/worstTopics reach the prompt as hook guidance /
 * avoid directives, and bestPostingTimes drives the publish node's optimal
 * schedule.
 */

function makeNode(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config,
    id,
    inputs: [],
    label: id,
    type,
  };
}

function makeEdge(
  source: string,
  target: string,
  handles: { sourceHandle?: string; targetHandle?: string } = {},
): ExecutableEdge {
  return {
    id: `${source}-${target}-${handles.targetHandle ?? ''}`,
    source,
    target,
    ...handles,
  };
}

function wrapExecutor(executor: INodeExecutor): NodeExecutor {
  return async (node, inputs, context) =>
    (await executor.execute({ context, inputs, node })).data;
}

const feedback: AnalyticsFeedbackOutput = {
  avgEngagementRate: 4.2,
  bestPlatform: 'tiktok',
  bestPostingTimes: [
    { avgEngagement: 3.1, dayOfWeek: 2, hour: 9 },
    { avgEngagement: 9.4, dayOfWeek: 5, hour: 18 },
  ],
  topHooks: ['ask a bold question', 'call out a common myth'],
  topTopics: ['ai workflows'],
  weekOverWeekChange: 12,
  weekOverWeekDirection: 'up',
  worstTopics: ['generic productivity tips'],
};

function makeContentLoopWorkflow(): ExecutableWorkflow {
  return {
    edges: [
      makeEdge('analytics-feedback', 'trend-trigger', {
        sourceHandle: 'topTopics',
        targetHandle: 'keywords',
      }),
      makeEdge('analytics-feedback', 'trend-trigger', {
        sourceHandle: 'bestPlatform',
        targetHandle: 'platform',
      }),
      makeEdge('trend-trigger', 'prompt-constructor', {
        sourceHandle: 'topic',
        targetHandle: 'topic',
      }),
      makeEdge('brand-context', 'prompt-constructor', {
        sourceHandle: 'voice',
        targetHandle: 'brandVoice',
      }),
      makeEdge('analytics-feedback', 'prompt-constructor', {
        sourceHandle: 'topHooks',
        targetHandle: 'topHooks',
      }),
      makeEdge('analytics-feedback', 'prompt-constructor', {
        sourceHandle: 'worstTopics',
        targetHandle: 'avoidTopics',
      }),
      makeEdge('prompt-constructor', 'text-gen', {
        sourceHandle: 'prompt',
        targetHandle: 'prompt',
      }),
      makeEdge('brand-context', 'publish', { targetHandle: 'brand' }),
      makeEdge('text-gen', 'publish', {
        sourceHandle: 'content',
        targetHandle: 'caption',
      }),
      makeEdge('analytics-feedback', 'publish', {
        sourceHandle: 'bestPostingTimes',
        targetHandle: 'bestPostingTimes',
      }),
    ],
    id: 'wf-content-loop',
    lockedNodeIds: [],
    nodes: [
      makeNode('analytics-feedback', 'analyticsFeedback', {
        // Real production graphs get this injected from the workflow's own
        // brandId by WorkflowEngineConverterService.withWorkflowBrandId; set
        // it explicitly here since this test builds the post-conversion
        // executable shape directly.
        brandId: 'brand-1',
        topN: 5,
        worstN: 3,
      }),
      makeNode('brand-context', 'brandContext', { brandId: 'brand-1' }),
      makeNode('trend-trigger', 'trendTrigger', {
        minViralScore: 70,
        platform: 'tiktok',
        trendType: 'hashtag',
      }),
      makeNode('prompt-constructor', 'promptConstructor', {
        template:
          'Write about {{topic}} in the voice: {{brandVoice}}. Lean into: {{topHooks}}. Avoid: {{avoidTopics}}.',
        variables: {},
      }),
      makeNode('text-gen', 'llm'),
      makeNode('publish', 'publish', {
        platforms: { tiktok: true },
        schedule: { type: 'optimal' },
      }),
    ],
    organizationId: 'org-1',
    userId: 'user-1',
  };
}

describe('content loop template graph (#3023)', () => {
  let engine: WorkflowEngine;
  let publishResolver: PublishResolver;

  beforeEach(() => {
    vi.useFakeTimers();
    // Tuesday 2026-08-18T09:00:00Z
    vi.setSystemTime(new Date('2026-08-18T09:00:00.000Z'));

    engine = new WorkflowEngine({ maxConcurrency: 3 });

    const analyticsFeedback = new AnalyticsFeedbackExecutor();
    analyticsFeedback.setResolver(vi.fn().mockResolvedValue(feedback));

    const brandContext = new BrandContextExecutor();
    brandContext.setResolver(
      vi.fn().mockResolvedValue({
        brandId: 'brand-1',
        colors: null,
        fonts: null,
        label: 'Genfeed',
        models: null,
        slug: 'genfeed',
        voice: 'confident and direct',
        voiceConfig: null,
      }),
    );

    const trendTrigger = new TrendTriggerExecutor();
    trendTrigger.setChecker(
      vi.fn().mockResolvedValue({
        hashtags: ['#aiworkflows'],
        platform: 'tiktok',
        soundId: null,
        topic: 'ai workflows',
        trendId: 'trend-1',
        videoUrl: null,
        viralScore: 82,
      }),
    );

    const promptConstructor = new PromptConstructorExecutor();

    const publish = new PublishExecutor();
    publishResolver = vi.fn().mockResolvedValue({
      platforms: ['tiktok'],
      postIds: ['post-1'],
      scheduledFor: null,
      status: 'scheduled',
    });
    publish.setResolver(publishResolver);

    engine.registerExecutor(
      'analyticsFeedback',
      wrapExecutor(analyticsFeedback),
    );
    engine.registerExecutor('brandContext', wrapExecutor(brandContext));
    engine.registerExecutor('trendTrigger', wrapExecutor(trendTrigger));
    engine.registerExecutor(
      'promptConstructor',
      wrapExecutor(promptConstructor),
    );
    engine.registerExecutor('llm', async (_node, inputs) => ({
      content: `Generated: ${String(inputs.get('prompt') ?? '')}`,
    }));
    engine.registerExecutor('publish', wrapExecutor(publish));
  });

  it('resolves topHooks and worstTopics into the prompt as hook guidance and avoid directives', async () => {
    const result = await engine.execute(makeContentLoopWorkflow());

    expect(result.status).toBe('completed');
    const prompt = result.nodeResults.get('prompt-constructor')?.output;
    expect(prompt).toBe(
      'Write about ai workflows in the voice: confident and direct. ' +
        'Lean into: ask a bold question, call out a common myth. ' +
        'Avoid: generic productivity tips.',
    );
  });

  it('schedules publish using the highest-engagement bestPostingTimes slot', async () => {
    const result = await engine.execute(makeContentLoopWorkflow());

    expect(result.status).toBe('completed');
    // Highest avgEngagement slot is Friday (dayOfWeek 5) at 18:00 UTC; "now"
    // is Tuesday 2026-08-18T09:00:00Z, so the next Friday is 2026-08-21.
    expect(publishResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        scheduledFor: new Date('2026-08-21T18:00:00.000Z'),
      }),
    );
    const publishOutput = result.nodeResults.get('publish')?.output as {
      status: string;
    };
    expect(publishOutput.status).toBe('scheduled');
  });
});

import { getNodeDefinition } from '@api/collections/workflows/registry/node-registry-adapter';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  CONTENT_LOOP_PROMPT_TEMPLATE,
  CONTENT_LOOP_TEMPLATE,
} from '@api/collections/workflows/templates/content-loop.template';
import {
  createPublishExecutor,
  PromptConstructorExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

const ANALYTICS_OUTPUT = {
  avgEngagementRate: 0.22,
  bestPlatform: 'tiktok',
  bestPostingTimes: [
    { avgEngagement: 0.11, dayOfWeek: 1, hour: 9 },
    { avgEngagement: 0.41, dayOfWeek: 2, hour: 18 },
  ],
  topHooks: ['I tried this for 7 days', 'Stop posting this way'],
  topTopics: ['ai tools'],
  weekOverWeekChange: 4,
  weekOverWeekDirection: 'up' as const,
  worstTopics: ['giveaway', 'unboxings'],
};

describe('CONTENT_LOOP_TEMPLATE', () => {
  it('wires every analytics recommendation output into a downstream handle', () => {
    expect(CONTENT_LOOP_TEMPLATE.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'analytics-feedback',
          sourceHandle: 'topTopics',
          target: 'trend-trigger',
          targetHandle: 'keywords',
        }),
        expect.objectContaining({
          source: 'analytics-feedback',
          sourceHandle: 'bestPlatform',
          target: 'trend-trigger',
          targetHandle: 'platform',
        }),
        expect.objectContaining({
          source: 'analytics-feedback',
          sourceHandle: 'topHooks',
          target: 'prompt-constructor',
          targetHandle: 'hooks',
        }),
        expect.objectContaining({
          source: 'analytics-feedback',
          sourceHandle: 'worstTopics',
          target: 'prompt-constructor',
          targetHandle: 'avoid',
        }),
        expect.objectContaining({
          source: 'analytics-feedback',
          sourceHandle: 'bestPostingTimes',
          target: 'publish',
          targetHandle: 'schedule',
        }),
      ]),
    );
  });

  it('keeps prompt and publish steps dependent on analytics feedback', () => {
    expect(
      CONTENT_LOOP_TEMPLATE.steps.find((step) => step.id === 'step-prompt')
        ?.dependsOn,
    ).toEqual(['step-analytics-feedback', 'step-trend-trigger']);
    expect(
      CONTENT_LOOP_TEMPLATE.steps.find((step) => step.id === 'step-publish')
        ?.dependsOn,
    ).toEqual(['step-analytics-feedback', 'step-generate']);
    expect(
      CONTENT_LOOP_TEMPLATE.nodes?.find(
        (node) => node.id === 'prompt-constructor',
      )?.data.config.template,
    ).toBe(CONTENT_LOOP_PROMPT_TEMPLATE);
  });

  it('declares every wired handle on the node definitions', () => {
    for (const edge of CONTENT_LOOP_TEMPLATE.edges ?? []) {
      const sourceNode = CONTENT_LOOP_TEMPLATE.nodes?.find(
        (node) => node.id === edge.source,
      );
      const targetNode = CONTENT_LOOP_TEMPLATE.nodes?.find(
        (node) => node.id === edge.target,
      );
      expect(sourceNode).toBeDefined();
      expect(targetNode).toBeDefined();

      if (edge.sourceHandle) {
        const sourceDefinition = getNodeDefinition(sourceNode?.type ?? '');
        expect(
          sourceDefinition?.outputs[edge.sourceHandle],
          `${sourceNode?.type}.${edge.sourceHandle}`,
        ).toBeDefined();
      }

      if (edge.targetHandle) {
        const targetDefinition = getNodeDefinition(targetNode?.type ?? '');
        expect(
          targetDefinition?.inputs[edge.targetHandle],
          `${targetNode?.type}.${edge.targetHandle}`,
        ).toBeDefined();
      }
    }
  });

  it('executes the template and resolves analytics handles into prompt and publish', async () => {
    const converter = new WorkflowEngineConverterService();
    const executable = converter.convertToExecutableWorkflow({
      brandId: 'brand-1',
      edges: CONTENT_LOOP_TEMPLATE.edges,
      id: 'content-loop',
      nodes: CONTENT_LOOP_TEMPLATE.nodes,
      organizationId: 'org-1',
      userId: 'user-1',
    });

    const captured = {
      promptInputs: new Map<string, unknown>(),
      publishInputs: new Map<string, unknown>(),
    };
    const promptExecutor = new PromptConstructorExecutor();
    const publishResolver = vi.fn().mockResolvedValue({
      platforms: ['tiktok'],
      postIds: ['post-1'],
      scheduledFor: new Date('2026-08-18T18:00:00.000Z'),
      status: 'scheduled',
    });
    const publishExecutor = createPublishExecutor(publishResolver);
    const engine = new WorkflowEngine({ maxConcurrency: 6 });

    engine.registerExecutor('analyticsFeedback', async () => ANALYTICS_OUTPUT);
    engine.registerExecutor('brandContext', async () => ({
      brandId: 'brand-1',
      voice: 'direct and technical',
    }));
    engine.registerExecutor('trendTrigger', async (_node, inputs) => ({
      hashtags: [],
      keywords: inputs.get('keywords'),
      platform: inputs.get('platform') ?? 'tiktok',
      soundId: null,
      topic: 'ai tools',
      trendId: 'trend-1',
      videoUrl: null,
      viralScore: 88,
    }));
    engine.registerExecutor(
      'promptConstructor',
      async (node, inputs, context) => {
        captured.promptInputs = new Map(inputs);
        const result = await promptExecutor.execute({ context, inputs, node });
        return result.data;
      },
    );
    engine.registerExecutor('llm', async () => ({
      content: 'generated caption',
      text: 'generated caption',
    }));
    engine.registerExecutor('publish', async (node, inputs, context) => {
      captured.publishInputs = new Map(inputs);
      const result = await publishExecutor.execute({ context, inputs, node });
      return result.data;
    });

    const result = await engine.execute(executable);

    expect(result.status).toBe('completed');
    expect(captured.promptInputs.get('hooks')).toEqual(
      ANALYTICS_OUTPUT.topHooks,
    );
    expect(captured.promptInputs.get('avoid')).toEqual(
      ANALYTICS_OUTPUT.worstTopics,
    );
    expect(captured.promptInputs.get('topic')).toBe('ai tools');
    expect(captured.publishInputs.get('schedule')).toEqual(
      ANALYTICS_OUTPUT.bestPostingTimes,
    );
    expect(publishResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        caption: 'generated caption',
        scheduledFor: expect.any(Date),
      }),
    );

    const promptOutput = result.nodeResults.get('prompt-constructor')?.output;
    expect(String(promptOutput)).toContain('Proven hooks to emulate:');
    expect(String(promptOutput)).toContain('Avoid these topics:');
    expect(String(promptOutput)).toContain('I tried this for 7 days');
    expect(String(promptOutput)).toContain('giveaway');
  });
});

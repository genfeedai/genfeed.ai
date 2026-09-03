import { getNodeDefinition } from '@api/collections/workflows/registry/node-registry-adapter';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  CONTENT_LOOP_PROMPT_TEMPLATE,
  CONTENT_LOOP_TEMPLATE,
} from '@api/collections/workflows/templates/content-loop.template';
import { NODE_DEFINITIONS as CORE_NODE_DEFINITIONS } from '@genfeedai/contracts/types/nodes';
import {
  createPublishExecutor,
  PromptConstructorExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { getWorkflowPresentationNodeType } from '@genfeedai/workflows/nodes';
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

/**
 * Product nodes persist as `genfeedAction`, so their handles live on the
 * presentation definition for the configured action, not on the node type.
 * Catalog definitions use arrays; the API adapter maps those arrays by id.
 */
function handleExists(handles: unknown, handleId: string): boolean {
  if (!handles) {
    return false;
  }
  if (Array.isArray(handles)) {
    return handles.some(
      (handle) =>
        handle !== null &&
        typeof handle === 'object' &&
        'id' in handle &&
        handle.id === handleId,
    );
  }
  if (typeof handles === 'object') {
    return handleId in handles;
  }
  return false;
}

function resolvePresentationType(
  node: { data: { config?: unknown }; type: string } | undefined,
): string | undefined {
  if (!node) {
    return undefined;
  }

  const actionId = (node.data.config as { actionId?: string } | undefined)
    ?.actionId;

  return actionId ? getWorkflowPresentationNodeType(actionId) : node.type;
}

function definitionDeclaresHandle(
  node: { data: { config?: unknown }; type: string } | undefined,
  handleId: string,
  direction: 'inputs' | 'outputs',
): boolean {
  const presentationType = resolvePresentationType(node);
  if (!presentationType) {
    return false;
  }

  const adapterDefinition = getNodeDefinition(presentationType);
  const coreDefinition =
    presentationType in CORE_NODE_DEFINITIONS
      ? CORE_NODE_DEFINITIONS[
          presentationType as keyof typeof CORE_NODE_DEFINITIONS
        ]
      : undefined;

  return (
    handleExists(adapterDefinition?.[direction], handleId) ||
    handleExists(coreDefinition?.[direction], handleId)
  );
}

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
      CONTENT_LOOP_TEMPLATE.edges?.filter(
        (edge) => edge.target === 'prompt-constructor',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'analytics-feedback' }),
        expect.objectContaining({ source: 'trend-trigger' }),
      ]),
    );
    const promptConfig = CONTENT_LOOP_TEMPLATE.nodes?.find(
      (node) => node.id === 'prompt-constructor',
    )?.data.config;
    expect(
      (promptConfig?.parameters as Record<string, unknown> | undefined)
        ?.template,
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
        expect(
          definitionDeclaresHandle(sourceNode, edge.sourceHandle, 'outputs'),
          `${sourceNode?.type}.${edge.sourceHandle}`,
        ).toBe(true);
      }

      if (edge.targetHandle) {
        expect(
          definitionDeclaresHandle(targetNode, edge.targetHandle, 'inputs'),
          `${targetNode?.type}.${edge.targetHandle}`,
        ).toBe(true);
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
      colors: { background: '#000', primary: '#fff', secondary: '#888' },
      fonts: null,
      label: 'Brand One',
      models: { image: null, imageToVideo: null, music: null, video: null },
      slug: 'brand-one',
      voice: 'direct and technical',
      voiceConfig: null,
    }));
    engine.registerExecutor('trendTrigger', async (_node, inputs) => ({
      hashtags: [],
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
      model: 'test-model',
      text: 'generated caption',
    }));
    engine.registerExecutor('publish', async (node, inputs, context) => {
      captured.publishInputs = new Map(inputs);
      const result = await publishExecutor.execute({ context, inputs, node });
      return result.data;
    });

    const result = await engine.execute(executable);

    expect(
      result.status,
      Array.from(result.nodeResults.entries())
        .filter(([, nodeResult]) => nodeResult.error)
        .map(([nodeId, nodeResult]) => `${nodeId}: ${nodeResult.error}`)
        .join(' | ') ||
        (result.error ?? ''),
    ).toBe('completed');
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

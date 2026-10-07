import { getActionDefinition } from '@genfeedai/actions';
import { ImageTaskModel, VideoTaskModel } from '@genfeedai/contracts';
import {
  buildActionExecutionInput,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';
import { buildContentPipelineWorkflowDefinition } from './content-pipeline-workflow-definition';

describe('buildContentPipelineWorkflowDefinition', () => {
  it('compiles every product step into a registered action node', () => {
    const graph = buildContentPipelineWorkflowDefinition({
      brandId: 'brand-1',
      idempotencyKey: 'plan-item-1',
      organizationId: 'org-1',
      personaId: 'persona-1',
      prompt: 'Launch the product',
      steps: [
        { model: ImageTaskModel.FAL, type: 'text-to-image' },
        { model: VideoTaskModel.HIGGSFIELD, type: 'image-to-video' },
      ],
      userId: 'user-1',
    });

    expect(graph.canonicalId).toBe('content-pipeline:persona-1:plan-item-1');
    expect(
      graph.definition.nodes?.map((node) => [
        node.type,
        node.data.config.actionId,
      ]),
    ).toEqual([
      ['genfeedAction', 'content.pipeline.resolve-context'],
      ['genfeedAction', 'content.pipeline.generate-image'],
      ['genfeedAction', 'content.pipeline.generate-video'],
      ['genfeedAction', 'content.pipeline.publish'],
    ]);
    expect(graph.definition.edges).toEqual([
      {
        id: 'context-to-publish',
        source: 'resolve-context',
        target: 'publish-content',
        targetHandle: 'pipelineContext',
      },
      {
        id: 'context-to-generate-1',
        source: 'resolve-context',
        target: 'generate-1',
        targetHandle: 'pipelineContext',
      },
      {
        id: 'context-to-generate-2',
        source: 'resolve-context',
        target: 'generate-2',
        targetHandle: 'pipelineContext',
      },
      {
        id: 'generate-1-to-2',
        source: 'generate-1',
        target: 'generate-2',
        targetHandle: 'previousOutcome',
      },
      {
        id: 'generate-1-to-publish',
        source: 'generate-1',
        target: 'publish-content',
        targetHandle: 'stepOutcome0',
      },
      {
        id: 'generate-2-to-publish',
        source: 'generate-2',
        target: 'publish-content',
        targetHandle: 'stepOutcome1',
      },
    ]);
  });

  it('delivers input every node contract accepts', () => {
    const steps = [
      { model: ImageTaskModel.FAL, type: 'text-to-image' as const },
      { model: VideoTaskModel.HIGGSFIELD, type: 'image-to-video' as const },
    ];
    const graph = buildContentPipelineWorkflowDefinition({
      brandId: 'brand-1',
      organizationId: 'org-1',
      personaId: 'persona-1',
      prompt: 'Launch the product',
      runReferences: [{ assetId: 'asset-1', role: 'style' }],
      scheduledDate: new Date('2026-10-07T00:00:00.000Z'),
      steps,
      userId: 'user-1',
    });
    const outcome = (stepIndex: number) => ({
      ingredientId: `ingredient-${stepIndex}`,
      result: { contentType: 'image/png', url: 'https://cdn/x.png' },
      step: steps[stepIndex],
      stepIndex,
      timingMs: 1,
    });
    const edgeValues: Record<string, unknown> = {
      pipelineContext: { hasCredentials: true },
      previousOutcome: outcome(0),
      stepOutcome0: outcome(0),
      stepOutcome1: outcome(1),
    };

    for (const node of graph.definition.nodes ?? []) {
      const config = node.data.config as Record<string, unknown>;
      const actionId = String(config.actionId);
      const action = getActionDefinition(actionId);
      const contract = compileActionContract(actionId, {
        inputSchema: (action?.inputSchema ?? {}) as Readonly<
          Record<string, unknown>
        >,
        outputSchema: (action?.outputSchema ?? {}) as Readonly<
          Record<string, unknown>
        >,
      });
      const inputs = Object.fromEntries(
        (graph.definition.edges ?? [])
          .filter((edge) => edge.target === node.id)
          .map((edge) => {
            const key = edge.targetHandle ?? edge.source;
            return [key, edgeValues[key]];
          }),
      );

      expect(() =>
        contract.validateInput(buildActionExecutionInput(config, inputs), {
          nodeId: node.id,
          runId: 'run',
          workflowId: graph.canonicalId,
          workflowVersionId: 'v1',
        }),
      ).not.toThrow();
    }
  });

  it('rejects an empty graph instead of creating a pass-through workflow', () => {
    expect(() =>
      buildContentPipelineWorkflowDefinition({
        brandId: 'brand-1',
        organizationId: 'org-1',
        personaId: 'persona-1',
        steps: [],
        userId: 'user-1',
      }),
    ).toThrow('requires at least one action');
  });
});

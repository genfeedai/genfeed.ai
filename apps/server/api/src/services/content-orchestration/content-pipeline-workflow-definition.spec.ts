import { ImageTaskModel, VideoTaskModel } from '@genfeedai/contracts';
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

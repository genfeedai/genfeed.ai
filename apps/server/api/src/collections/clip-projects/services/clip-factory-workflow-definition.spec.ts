import {
  buildClipFactoryWorkflowDefinition,
  buildClipGenerationChildWorkflowDefinition,
} from './clip-factory-workflow-definition';

describe('clip factory workflow definitions', () => {
  it('fans discovered highlights into one registered child workflow', () => {
    const workflow = buildClipFactoryWorkflowDefinition();
    const actionNodes = workflow.definition.nodes?.filter(
      (node) => node.type === 'genfeedAction',
    );

    expect(workflow.canonicalId).toBe('clip.factory');
    expect(workflow.resultNodeId).toBe('generate-remaining');
    expect(actionNodes?.map((node) => node.data.config.actionId)).toEqual([
      'clip.analysis.prepare-source',
      'clip.analysis.transcribe',
      'clip.analysis.detect-highlights',
      'clip.generation.plan',
      'workflow.for-each',
      'workflow.for-each',
    ]);
    expect(
      workflow.definition.nodes?.find(
        (node) => node.id === 'hook-review-required',
      )?.type,
    ).toBe('condition');
    expect(
      workflow.definition.nodes?.find((node) => node.id === 'review-hook')
        ?.type,
    ).toBe('reviewGate');
    expect(workflow.definition.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'generate-hook',
          target: 'review-hook',
          targetHandle: 'media',
        }),
        expect.objectContaining({
          source: 'hook-review-required',
          sourceHandle: 'false',
          target: 'generate-remaining',
        }),
        expect.objectContaining({
          source: 'review-hook',
          target: 'generate-remaining',
        }),
      ]),
    );
  });

  it('defines one atomic per-highlight child', () => {
    const child = buildClipGenerationChildWorkflowDefinition();

    expect(child.canonicalId).toBe('clip.generation.one');
    expect(child.resultNodeId).toBe('finalize-child');
    expect(child.definition.nodes).toHaveLength(2);
    expect(child.definition.nodes?.[0]?.data.config.actionId).toBe(
      'clip.generation.generate-one',
    );
    expect(child.definition.nodes?.[1]?.data.config.actionId).toBe(
      'clip.generation.finalize-child',
    );
    expect(child.definition.edges).toEqual([
      {
        id: 'generation-to-finalization',
        source: 'generate-clip',
        target: 'finalize-child',
        targetHandle: 'generation',
      },
      {
        id: 'generation-failure-to-finalization',
        source: 'generate-clip',
        sourceHandle: 'failure',
        target: 'finalize-child',
        targetHandle: 'failure',
      },
    ]);
  });
});

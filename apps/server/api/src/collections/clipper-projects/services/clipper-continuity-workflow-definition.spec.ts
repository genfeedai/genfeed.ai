import { describe, expect, it } from 'vitest';
import {
  buildClipperContinuityFailureWorkflowDefinition,
  buildClipperContinuityQaWorkflowDefinition,
  buildClipperContinuityWorkflowDefinition,
} from './clipper-continuity-workflow-definition';

describe('clip continuity workflow definitions', () => {
  it('uses one static fan-out graph for every clip count', () => {
    const definition = buildClipperContinuityWorkflowDefinition();

    expect(definition.canonicalId).toBe('clipper.continuity');
    expect(definition.organizationModule).toBe('clipper');
    expect(definition.moduleCompletionNodeIds).toEqual([
      'persist-continuity-report',
    ]);
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      'clipper.continuity.begin',
      'workflow.for-each',
      'clipper.continuity.persist-report',
    ]);
    expect(definition.definition.nodes[1]?.data.config).toEqual(
      expect.objectContaining({
        parameters: expect.objectContaining({
          childWorkflowId: 'clipper.continuity.qa-one',
          itemInputKey: 'video',
          mode: 'await',
        }),
      }),
    );
  });

  it('registers atomic QA and failure child graphs', () => {
    const qa = buildClipperContinuityQaWorkflowDefinition();
    const failure = buildClipperContinuityFailureWorkflowDefinition();

    expect(qa.organizationModule).toBe('clipper');
    expect(qa.moduleCompletionNodeIds).toBeUndefined();
    expect(failure.organizationModule).toBeUndefined();
    expect(qa.definition.nodes).toHaveLength(1);
    expect(qa.definition.nodes[0]?.data.config.actionId).toBe('videoQa');
    expect(failure.definition.nodes).toHaveLength(1);
    expect(failure.definition.nodes[0]?.data.config.actionId).toBe(
      'clipper.continuity.fail',
    );
  });
});

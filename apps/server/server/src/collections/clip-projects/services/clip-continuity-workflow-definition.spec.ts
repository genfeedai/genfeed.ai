import { describe, expect, it } from 'vitest';
import {
  buildClipContinuityFailureWorkflowDefinition,
  buildClipContinuityQaWorkflowDefinition,
  buildClipContinuityWorkflowDefinition,
} from './clip-continuity-workflow-definition';

describe('clip continuity workflow definitions', () => {
  it('uses one static fan-out graph for every clip count', () => {
    const definition = buildClipContinuityWorkflowDefinition();

    expect(definition.canonicalId).toBe('clip.continuity');
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      'clip.continuity.begin',
      'workflow.for-each',
      'clip.continuity.persist-report',
    ]);
    expect(definition.definition.nodes[1]?.data.config).toEqual(
      expect.objectContaining({
        parameters: expect.objectContaining({
          childWorkflowId: 'clip.continuity.qa-one',
          itemInputKey: 'video',
          mode: 'await',
        }),
      }),
    );
  });

  it('registers atomic QA and failure child graphs', () => {
    const qa = buildClipContinuityQaWorkflowDefinition();
    const failure = buildClipContinuityFailureWorkflowDefinition();

    expect(qa.definition.nodes).toHaveLength(1);
    expect(qa.definition.nodes[0]?.data.config.actionId).toBe('videoQa');
    expect(failure.definition.nodes).toHaveLength(1);
    expect(failure.definition.nodes[0]?.data.config.actionId).toBe(
      'clip.continuity.fail',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { buildClipContinuityWorkflowDefinition } from './clip-continuity-workflow-definition';

function actionIds(clipCount: number): string[] {
  return buildClipContinuityWorkflowDefinition(clipCount).definition.nodes.map(
    (node) => String(node.data.config.actionId),
  );
}

describe('buildClipContinuityWorkflowDefinition', () => {
  it('builds one video QA action node per completed clip', () => {
    const definition = buildClipContinuityWorkflowDefinition(2);

    expect(actionIds(2)).toEqual([
      'clip.continuity.begin',
      'videoQa',
      'videoQa',
      'clip.continuity.persist-report',
    ]);
    expect(definition.canonicalId).toBe('clip-continuity:v1:2');
    expect(definition.definition.edges).toHaveLength(4);
    expect(definition.definition.nodes[1]?.data.inputVariableKeys).toContain(
      'video0',
    );
  });

  it('still persists an observable skip when no clip needs assessment', () => {
    const definition = buildClipContinuityWorkflowDefinition(0);

    expect(actionIds(0)).toEqual([
      'clip.continuity.begin',
      'clip.continuity.persist-report',
    ]);
    expect(definition.definition.edges).toEqual([
      expect.objectContaining({
        source: 'begin-continuity',
        target: 'persist-continuity-report',
      }),
    ]);
  });
});

import { getActionDefinition } from '@genfeedai/actions';
import {
  AGENT_RUNTIME_ACTION_IDS,
  buildAgentTurnWorkflowDefinition,
} from '@server/collections/workflows/services/agent-runtime-workflow-definitions';
import { describe, expect, it } from 'vitest';

describe('agent runtime workflow definitions', () => {
  it('keeps terminal success and failure paths mutually exclusive', () => {
    const definition = buildAgentTurnWorkflowDefinition();
    const edges = definition.definition.edges;

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'infer-turn',
          sourceHandle: 'final',
          target: 'finalize-turn',
          targetHandle: 'final',
        }),
        expect.objectContaining({
          source: 'infer-turn',
          sourceHandle: 'state',
          target: 'finalize-turn',
          targetHandle: 'state',
        }),
        expect.objectContaining({
          source: 'infer-turn',
          sourceHandle: 'failure',
          target: 'fail-turn',
          targetHandle: 'failure',
        }),
      ]),
    );
    expect(
      edges.some(
        (edge) =>
          edge.source === 'prepare-turn' &&
          ['finalize-turn', 'fail-turn'].includes(edge.target) &&
          edge.sourceHandle === 'state',
      ),
    ).toBe(false);
  });

  it('backs every turn node with a registered action contract', () => {
    const actionIds = buildAgentTurnWorkflowDefinition().definition.nodes.map(
      (node) => String(node.data.config.actionId),
    );

    expect(actionIds).toEqual([
      AGENT_RUNTIME_ACTION_IDS.TURN_PREPARE,
      AGENT_RUNTIME_ACTION_IDS.TURN_INFER,
      AGENT_RUNTIME_ACTION_IDS.TURN_FINALIZE,
      AGENT_RUNTIME_ACTION_IDS.TURN_FAIL,
    ]);
    expect(actionIds.every((actionId) => getActionDefinition(actionId))).toBe(
      true,
    );
  });
});

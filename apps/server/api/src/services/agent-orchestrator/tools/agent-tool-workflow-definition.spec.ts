import {
  AGENT_TOOL_WORKFLOW_DEFINITIONS,
  findAgentToolWorkflowDefinition,
} from '@api/services/agent-orchestrator/tools/agent-tool-workflow-definition';

describe('agent tool workflow definitions', () => {
  it('materializes one immutable registered graph for every workflow-enabled tool', () => {
    const canonicalIds = AGENT_TOOL_WORKFLOW_DEFINITIONS.map(
      (definition) => definition.canonicalId,
    );

    expect(new Set(canonicalIds).size).toBe(canonicalIds.length);
    for (const definition of AGENT_TOOL_WORKFLOW_DEFINITIONS) {
      expect(definition.definition.nodes).toHaveLength(1);
      expect(definition.definition.nodes[0]?.type).toBe('genfeedAction');
      expect(
        definition.definition.inputVariables?.map(({ key }) => key),
      ).toEqual(['parameters']);
      expect(definition.resultNodeId).toBe('execute-tool');
    }
  });

  it('selects definitions from the registered immutable set', () => {
    const definition = AGENT_TOOL_WORKFLOW_DEFINITIONS[0];
    const actionId = definition?.definition.nodes[0]?.data.config.actionId;

    expect(definition).toBeDefined();
    expect(findAgentToolWorkflowDefinition(actionId as never)).toBe(definition);
  });
});

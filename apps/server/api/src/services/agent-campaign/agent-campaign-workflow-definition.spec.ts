import {
  AGENT_CAMPAIGN_ACTION_IDS,
  AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS,
  AGENT_CAMPAIGN_WORKFLOW_IDS,
  buildAgentCampaignDueOrchestrationWorkflowDefinition,
  buildAgentCampaignOrchestrationWorkflowDefinition,
  buildAgentCampaignTriggerSweepWorkflowDefinition,
  buildAgentCampaignTriggerWorkflowDefinition,
} from '@api/services/agent-campaign/agent-campaign-workflow-definition';

describe('agent campaign workflow definitions', () => {
  it('registers every public and child graph as an immutable definition', () => {
    expect(
      AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS.map(
        (definition) => definition.canonicalId,
      ),
    ).toEqual(
      expect.arrayContaining(Object.values(AGENT_CAMPAIGN_WORKFLOW_IDS)),
    );
  });

  it('fans due campaigns into the orchestration graph', () => {
    const definition = buildAgentCampaignDueOrchestrationWorkflowDefinition();
    const discover = definition.definition.nodes[0];
    const fanOut = definition.definition.nodes[1];

    expect(definition.definition.inputVariables).toEqual([]);
    expect(discover?.data.config.actionId).toBe(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_DISCOVER_DUE,
    );
    expect(fanOut?.data.config.actionId).toBe('workflow.for-each');
    expect(fanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: AGENT_CAMPAIGN_WORKFLOW_IDS.ORCHESTRATE,
      mode: 'await',
    });
  });

  it('keeps winner memory inside the campaign orchestration graph', () => {
    const definition = buildAgentCampaignOrchestrationWorkflowDefinition();
    const actionIds = definition.definition.nodes.map(
      (node) => node.data.config.actionId,
    );

    expect(actionIds).toContain(AGENT_CAMPAIGN_ACTION_IDS.MEMORY_LOAD_WINNERS);
    expect(actionIds).toContain(AGENT_CAMPAIGN_ACTION_IDS.MEMORY_PERSIST);
    expect(definition.definition.edges).toContainEqual(
      expect.objectContaining({
        source: 'persist-memory',
        target: 'finalize-cycle',
      }),
    );
  });

  it('fans recommendation writes and trigger groups through child workflows', () => {
    const definition = buildAgentCampaignTriggerWorkflowDefinition();
    const fanOuts = definition.definition.nodes.filter(
      (node) => node.data.config.actionId === 'workflow.for-each',
    );

    expect(
      fanOuts.map(
        (node) =>
          (node.data.config.parameters as Record<string, unknown>)
            .childWorkflowId,
      ),
    ).toEqual([
      AGENT_CAMPAIGN_WORKFLOW_IDS.PERSIST_TRIGGER_RECOMMENDATION,
      AGENT_CAMPAIGN_WORKFLOW_IDS.DISPATCH_TRIGGER_GROUP,
    ]);
  });

  it('fans eligible campaigns into trigger evaluation', () => {
    const definition = buildAgentCampaignTriggerSweepWorkflowDefinition();

    expect(
      definition.definition.nodes[1]?.data.config.parameters,
    ).toMatchObject({
      childWorkflowId: AGENT_CAMPAIGN_WORKFLOW_IDS.EVALUATE_TRIGGERS,
      mode: 'await',
    });
  });
});

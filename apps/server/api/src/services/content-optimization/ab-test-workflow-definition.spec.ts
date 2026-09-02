import {
  AB_TEST_ACTION_IDS,
  AB_TEST_WORKFLOW_IDS,
  buildAbTestExecutionWorkflowDefinition,
  buildAbTestResolutionWorkflowDefinition,
} from '@api/services/content-optimization/ab-test-workflow-definition';

describe('content optimization A/B test workflow definitions', () => {
  it('creates experiment arms through child workflows', () => {
    const definition = buildAbTestExecutionWorkflowDefinition();
    const fanOut = definition.definition.nodes.find(
      (node) => node.id === 'create-arms',
    );

    expect(fanOut?.data.config.actionId).toBe('workflow.for-each');
    expect(fanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: AB_TEST_WORKFLOW_IDS.EXECUTE_ARM,
      mode: 'await',
    });
    expect(definition.definition.nodes[0]?.data.config.actionId).toBe(
      AB_TEST_ACTION_IDS.PLAN_EXECUTION,
    );
  });

  it('persists scored outcomes through child workflows', () => {
    const definition = buildAbTestResolutionWorkflowDefinition();
    const fanOut = definition.definition.nodes.find(
      (node) => node.id === 'persist-outcomes',
    );

    expect(fanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: AB_TEST_WORKFLOW_IDS.RESOLVE_OUTCOME,
      mode: 'await',
    });
  });
});

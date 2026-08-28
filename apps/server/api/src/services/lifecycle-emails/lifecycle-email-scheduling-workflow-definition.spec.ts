import {
  buildLifecycleScheduleDeliveryWorkflowDefinition,
  buildLifecycleSchedulingWorkflowDefinition,
  LIFECYCLE_SCHEDULING_ACTION_IDS,
  LIFECYCLE_SCHEDULING_WORKFLOW_IDS,
} from './lifecycle-email-scheduling-workflow-definition';

describe('lifecycle email scheduling workflow definitions', () => {
  it('fans planned delivery and cancellation items through child workflows', () => {
    const definition = buildLifecycleSchedulingWorkflowDefinition();
    const actionIds = definition.definition.nodes.map(
      (node) => node.data.config.actionId,
    );

    expect(actionIds).toEqual([
      LIFECYCLE_SCHEDULING_ACTION_IDS.PLAN,
      'workflow.for-each',
      'workflow.for-each',
      LIFECYCLE_SCHEDULING_ACTION_IDS.FINALIZE,
    ]);
    expect(
      definition.definition.nodes[1]?.data.config.parameters,
    ).toMatchObject({
      childWorkflowId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.SCHEDULE_DELIVERY,
      mode: 'await',
    });
    expect(
      definition.definition.nodes[2]?.data.config.parameters,
    ).toMatchObject({
      childWorkflowId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.CANCEL_CHECKOUT,
      mode: 'await',
    });
  });

  it('persists before conditionally enqueuing one delivery', () => {
    const definition = buildLifecycleScheduleDeliveryWorkflowDefinition();

    expect(definition.definition.nodes[0]?.data.config.actionId).toBe(
      LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY,
    );
    expect(
      definition.definition.nodes[1]?.data.config.parameters,
    ).toMatchObject({
      childWorkflowId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.ENQUEUE_DELIVERY,
      mode: 'await',
    });
  });
});

import {
  buildReplyPostWatchWorkflowDefinition,
  REPLY_INGESTION_WORKFLOW_IDS,
} from './reply-ingestion-workflow-definition';

describe('reply ingestion workflow definitions', () => {
  it('durably fans post-watch comments into inbound workflows', () => {
    const definition = buildReplyPostWatchWorkflowDefinition();

    expect(definition.definition.nodes[1]?.data.config).toMatchObject({
      actionId: 'workflow.for-each',
      parameters: {
        childWorkflowId: REPLY_INGESTION_WORKFLOW_IDS.INBOUND,
        mode: 'scheduled',
      },
    });
  });
});

import { AUTHOR_REPLY_WORKFLOW_IDS } from './author-reply-workflow-definition';
import {
  buildReplyInboundWorkflowDefinition,
  buildReplyPostWatchWorkflowDefinition,
  REPLY_INGESTION_WORKFLOW_IDS,
} from './reply-ingestion-workflow-definition';

describe('reply ingestion workflow definitions', () => {
  it('invokes the reusable author-reply graph for one eligible inbound comment', () => {
    const definition = buildReplyInboundWorkflowDefinition();

    expect(definition.definition.nodes[1]?.data.config).toMatchObject({
      actionId: 'workflow.for-each',
      parameters: {
        childWorkflowId: AUTHOR_REPLY_WORKFLOW_IDS.SEND,
        maxConcurrency: 1,
        mode: 'await',
      },
    });
  });

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

import { AUTHOR_REPLY_WORKFLOW_IDS } from './author-reply-workflow-definition';
import {
  buildReplyInboundWorkflowDefinition,
  buildReplyPostWatchWorkflowDefinition,
  REPLY_INGESTION_ACTION_IDS,
  REPLY_INGESTION_WORKFLOW_IDS,
} from './reply-ingestion-workflow-definition';

describe('reply ingestion workflow definitions', () => {
  it.each([
    {
      graph: buildReplyInboundWorkflowDefinition(),
      actionId: REPLY_INGESTION_ACTION_IDS.FINALIZE_INBOUND,
    },
    {
      graph: buildReplyPostWatchWorkflowDefinition(),
      actionId: REPLY_INGESTION_ACTION_IDS.FINALIZE_POST_WATCH,
    },
  ])(
    '$graph.canonicalId requires Messages and only exempts prior-result projection',
    ({ graph, actionId }) => {
      expect(graph.organizationModule).toBe('messages');
      expect(graph.moduleCompletionNodeIds).toEqual([graph.resultNodeId]);
      expect(
        graph.definition.nodes.find((node) => node.id === graph.resultNodeId)
          ?.data.config.actionId,
      ).toBe(actionId);
      expect(
        graph.definition.edges.some(
          (edge) => edge.source === graph.resultNodeId,
        ),
      ).toBe(false);
    },
  );
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

import {
  buildKnowledgeSourceBackfillWorkflowDefinition,
  buildKnowledgeSourceIngestWorkflowDefinition,
  KNOWLEDGE_SOURCE_ACTION_IDS,
  KNOWLEDGE_SOURCE_WORKFLOW_IDS,
} from '@api/collections/contexts/services/knowledge-source-ingest-workflow-definition';
import { describe, expect, it } from 'vitest';

describe('knowledge source workflow definitions', () => {
  it('models ingestion as atomic load-through-finalize actions', () => {
    const definition = buildKnowledgeSourceIngestWorkflowDefinition();
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      KNOWLEDGE_SOURCE_ACTION_IDS.LOAD,
      KNOWLEDGE_SOURCE_ACTION_IDS.MARK,
      KNOWLEDGE_SOURCE_ACTION_IDS.EXTRACT,
      KNOWLEDGE_SOURCE_ACTION_IDS.CHUNK,
      KNOWLEDGE_SOURCE_ACTION_IDS.REPLACE,
      KNOWLEDGE_SOURCE_ACTION_IDS.FINALIZE,
    ]);
    expect(
      definition.definition.edges.filter(
        (edge) => edge.sourceHandle === 'failure',
      ),
    ).toHaveLength(4);
  });

  it('fans backfill discoveries into the registered ingest workflow', () => {
    const definition = buildKnowledgeSourceBackfillWorkflowDefinition();
    const fanOut = definition.definition.nodes.find(
      (node) => node.data.config.actionId === 'workflow.for-each',
    );
    expect(fanOut?.data?.config).toMatchObject({
      parameters: {
        childWorkflowId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
        itemInputKey: 'request',
        mode: 'scheduled',
      },
    });
  });
});

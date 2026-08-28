import { createGenfeedActionNode } from '@genfeedai/actions';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-runner.service';

export const KNOWLEDGE_SOURCE_ACTION_IDS = {
  DISCOVER_BACKFILL: 'knowledge.source.discover-backfill',
  INGEST: 'knowledge.source.ingest',
} as const;

export const KNOWLEDGE_SOURCE_WORKFLOW_IDS = {
  BACKFILL: 'knowledge.source.backfill',
  INGEST: 'knowledge.source.ingest',
} as const;

export function buildKnowledgeSourceIngestWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'Knowledge source',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: KNOWLEDGE_SOURCE_ACTION_IDS.INGEST,
          id: 'ingest-source',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description: 'Ingests one knowledge source into its context base.',
    label: 'Knowledge Source Ingest',
    resultNodeId: 'ingest-source',
    version: 1,
  };
}

export function buildKnowledgeSourceBackfillWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.BACKFILL,
    definition: {
      edges: [
        {
          id: 'discovery-to-ingest',
          source: 'discover-sources',
          sourceHandle: 'items',
          target: 'ingest-sources',
          targetHandle: 'items',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Backfill scope',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: KNOWLEDGE_SOURCE_ACTION_IDS.DISCOVER_BACKFILL,
          id: 'discover-sources',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'ingest-sources',
          parameters: {
            childWorkflowId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
            itemInputKey: 'request',
            maxConcurrency: 3,
            mode: 'scheduled',
          },
        }),
      ],
    },
    description:
      'Discovers stale knowledge sources and schedules one ingest workflow each.',
    label: 'Knowledge Source Backfill',
    resultNodeId: 'ingest-sources',
    version: 1,
  };
}

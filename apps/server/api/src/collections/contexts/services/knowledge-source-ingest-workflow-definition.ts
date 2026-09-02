import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const KNOWLEDGE_SOURCE_ACTION_IDS = {
  CHUNK: 'knowledge.source.chunk',
  DISCOVER_BACKFILL: 'knowledge.source.discover-backfill',
  EXTRACT: 'knowledge.source.extract',
  FINALIZE: 'knowledge.source.finalize',
  LOAD: 'knowledge.source.load',
  MARK: 'knowledge.source.mark-processing',
  REPLACE: 'knowledge.source.replace-chunks',
} as const;

export const KNOWLEDGE_SOURCE_WORKFLOW_IDS = {
  BACKFILL: 'knowledge.source.backfill',
  INGEST: 'knowledge.source.ingest',
} as const;

export function buildKnowledgeSourceIngestWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
    definition: {
      edges: [
        {
          id: 'load-mark',
          source: 'load-source',
          target: 'mark-source',
          targetHandle: 'state',
        },
        {
          id: 'mark-extract',
          source: 'mark-source',
          target: 'extract-source',
          targetHandle: 'state',
        },
        {
          id: 'extract-chunk',
          source: 'extract-source',
          target: 'chunk-source',
          targetHandle: 'state',
        },
        {
          id: 'chunk-replace',
          source: 'chunk-source',
          target: 'replace-chunks',
          targetHandle: 'state',
        },
        {
          id: 'replace-finalize',
          source: 'replace-chunks',
          target: 'finalize-source',
          targetHandle: 'state',
        },
        {
          id: 'mark-failure',
          source: 'mark-source',
          sourceHandle: 'failure',
          target: 'finalize-source',
          targetHandle: 'failure',
        },
        {
          id: 'extract-failure',
          source: 'extract-source',
          sourceHandle: 'failure',
          target: 'finalize-source',
          targetHandle: 'failure',
        },
        {
          id: 'chunk-failure',
          source: 'chunk-source',
          sourceHandle: 'failure',
          target: 'finalize-source',
          targetHandle: 'failure',
        },
        {
          id: 'replace-failure',
          source: 'replace-chunks',
          sourceHandle: 'failure',
          target: 'finalize-source',
          targetHandle: 'failure',
        },
      ],
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
          actionId: KNOWLEDGE_SOURCE_ACTION_IDS.LOAD,
          id: 'load-source',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: KNOWLEDGE_SOURCE_ACTION_IDS.MARK,
          id: 'mark-source',
        }),
        createGenfeedActionNode({
          actionId: KNOWLEDGE_SOURCE_ACTION_IDS.EXTRACT,
          id: 'extract-source',
        }),
        createGenfeedActionNode({
          actionId: KNOWLEDGE_SOURCE_ACTION_IDS.CHUNK,
          id: 'chunk-source',
        }),
        createGenfeedActionNode({
          actionId: KNOWLEDGE_SOURCE_ACTION_IDS.REPLACE,
          id: 'replace-chunks',
        }),
        createGenfeedActionNode({
          actionId: KNOWLEDGE_SOURCE_ACTION_IDS.FINALIZE,
          id: 'finalize-source',
        }),
      ],
    },
    description: 'Ingests one knowledge source into its context base.',
    label: 'Knowledge Source Ingest',
    resultNodeId: 'finalize-source',
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

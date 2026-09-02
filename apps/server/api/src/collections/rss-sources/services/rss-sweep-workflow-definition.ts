import type { WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const RSS_SWEEP_ACTION_IDS = {
  CLAIM_ITEM: 'rss.item.claim',
  CREATE_RELEASE: 'rss.item.create-release',
  DISCOVER_SOURCES: 'rss.sweep.discover-sources',
  FETCH_ITEMS: 'rss.source.fetch-items',
  FINALIZE_ITEM: 'rss.item.finalize',
  FINALIZE_SOURCE: 'rss.source.finalize',
  PUBLISH_ITEM: 'rss.item.publish',
} as const;

export const RSS_SWEEP_WORKFLOW_IDS = {
  ITEM: 'rss.item.process',
  SOURCE: 'rss.source.process',
  SWEEP: 'rss.sweep',
} as const;

function actionNode(
  actionId: string,
  id: string,
  y: number,
  inputVariableKeys: string[] = [],
  parameters: Record<string, unknown> = {},
) {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys,
    parameters,
    position: { x: 0, y },
  });
}

function conditionNode(
  id: string,
  label: string,
  field: string,
  y: number,
): WorkflowVisualNode {
  return {
    data: {
      config: { customField: field, field: 'custom', operator: 'isTrue' },
      label,
    },
    id,
    position: { x: 0, y },
    type: 'condition',
  };
}

export function buildRssSweepWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: RSS_SWEEP_WORKFLOW_IDS.SWEEP,
    definition: {
      edges: [
        {
          id: 'discover-sources',
          source: 'discover-sources',
          sourceHandle: 'items',
          target: 'process-sources',
          targetHandle: 'items',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Sweep request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(
          RSS_SWEEP_ACTION_IDS.DISCOVER_SOURCES,
          'discover-sources',
          0,
          ['request'],
        ),
        actionNode('workflow.for-each-tenant', 'process-sources', 180, [], {
          childWorkflowId: RSS_SWEEP_WORKFLOW_IDS.SOURCE,
          itemInputKey: 'request',
          maxConcurrency: 3,
          mode: 'await',
        }),
      ],
    },
    description:
      'Discovers enabled RSS sources and processes each through a child workflow.',
    label: 'RSS Source Sweep',
    resultNodeId: 'process-sources',
    version: 1,
  };
}

export function buildRssSourceWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: RSS_SWEEP_WORKFLOW_IDS.SOURCE,
    definition: {
      edges: [
        {
          id: 'fetch-items',
          source: 'fetch-items',
          sourceHandle: 'items',
          target: 'process-items',
          targetHandle: 'items',
        },
        {
          id: 'items-finalize',
          source: 'process-items',
          target: 'finalize-source',
          targetHandle: 'results',
        },
        {
          id: 'fetch-failure',
          source: 'fetch-items',
          sourceHandle: 'failure',
          target: 'finalize-source',
          targetHandle: 'failure',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Source request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(RSS_SWEEP_ACTION_IDS.FETCH_ITEMS, 'fetch-items', 0, [
          'request',
        ]),
        actionNode('workflow.for-each', 'process-items', 180, [], {
          childWorkflowId: RSS_SWEEP_WORKFLOW_IDS.ITEM,
          itemInputKey: 'request',
          maxConcurrency: 3,
          mode: 'await',
        }),
        actionNode(
          RSS_SWEEP_ACTION_IDS.FINALIZE_SOURCE,
          'finalize-source',
          360,
          ['request'],
        ),
      ],
    },
    description:
      'Fetches one feed, fans out its entries, and finalizes source counters.',
    label: 'Process RSS Source',
    resultNodeId: 'finalize-source',
    version: 1,
  };
}

export function buildRssItemWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: RSS_SWEEP_WORKFLOW_IDS.ITEM,
    definition: {
      edges: [
        {
          id: 'claim-import',
          source: 'claim-item',
          target: 'should-import',
          targetHandle: 'value',
        },
        {
          id: 'import-release',
          source: 'should-import',
          sourceHandle: 'true',
          target: 'create-release',
          targetHandle: 'claim',
        },
        {
          id: 'skip-finalize',
          source: 'should-import',
          sourceHandle: 'false',
          target: 'finalize-item',
          targetHandle: 'outcome',
        },
        {
          id: 'release-publish-check',
          source: 'create-release',
          target: 'should-publish',
          targetHandle: 'value',
        },
        {
          id: 'publish-release',
          source: 'should-publish',
          sourceHandle: 'true',
          target: 'publish-item',
          targetHandle: 'release',
        },
        {
          id: 'publish-finalize',
          source: 'publish-item',
          target: 'finalize-item',
          targetHandle: 'outcome',
        },
        {
          id: 'draft-finalize',
          source: 'should-publish',
          sourceHandle: 'false',
          target: 'finalize-item',
          targetHandle: 'outcome',
        },
        {
          id: 'create-failure',
          source: 'create-release',
          sourceHandle: 'failure',
          target: 'finalize-item',
          targetHandle: 'failure',
        },
        {
          id: 'publish-failure',
          source: 'publish-item',
          sourceHandle: 'failure',
          target: 'finalize-item',
          targetHandle: 'failure',
        },
      ],
      inputVariables: [
        { key: 'request', label: 'Feed item', required: true, type: 'json' },
      ],
      nodes: [
        actionNode(RSS_SWEEP_ACTION_IDS.CLAIM_ITEM, 'claim-item', 0, [
          'request',
        ]),
        conditionNode('should-import', 'Import item?', 'shouldImport', 120),
        actionNode(RSS_SWEEP_ACTION_IDS.CREATE_RELEASE, 'create-release', 240, [
          'request',
        ]),
        conditionNode('should-publish', 'Publish now?', 'shouldPublish', 360),
        actionNode(RSS_SWEEP_ACTION_IDS.PUBLISH_ITEM, 'publish-item', 480, [
          'request',
        ]),
        actionNode(RSS_SWEEP_ACTION_IDS.FINALIZE_ITEM, 'finalize-item', 600, [
          'request',
        ]),
      ],
    },
    description:
      'Claims one feed item, creates its release, conditionally publishes, and finalizes the item.',
    label: 'Process RSS Item',
    resultNodeId: 'finalize-item',
    version: 1,
  };
}

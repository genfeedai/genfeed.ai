import { createGenfeedActionNode } from '@genfeedai/actions';
import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@server/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-runner.service';

export const TRENDS_MAINTENANCE_ACTION_IDS = {
  EVALUATE_BACKFILL: 'trends.maintenance.evaluate-backfill',
  EXPIRE_HASHTAGS: 'trends.maintenance.expire-hashtags',
  EXPIRE_SOUNDS: 'trends.maintenance.expire-sounds',
  EXPIRE_TRENDS: 'trends.maintenance.expire-trends',
  EXPIRE_VIDEOS: 'trends.maintenance.expire-videos',
  FETCH_DATASET: 'trends.maintenance.fetch-dataset',
  FETCH_GLOBAL: 'trends.maintenance.fetch-global',
  FETCH_SOUNDS: 'trends.maintenance.fetch-sounds',
  FINALIZE_BACKFILL: 'trends.maintenance.finalize-backfill',
  PRECOMPUTE_PREVIEW: 'trends.maintenance.precompute-preview',
} as const;

export const TRENDS_MAINTENANCE_WORKFLOW_IDS = {
  BACKFILL: 'trends.maintenance.backfill',
  DATASET_TASK: 'trends.maintenance.dataset-task',
  REFRESH: 'trends.maintenance.refresh',
} as const;

export type TrendDatasetTask = {
  dataset: 'hashtags' | 'videos';
  platform: string;
};

export type TrendsMaintenanceRequest = {
  requestedAt: string;
  source: string;
};

const DATASET_TASKS: TrendDatasetTask[] = [
  { dataset: 'videos', platform: 'tiktok' },
  { dataset: 'videos', platform: 'instagram' },
  { dataset: 'videos', platform: 'youtube' },
  { dataset: 'videos', platform: 'reddit' },
  { dataset: 'hashtags', platform: 'tiktok' },
  { dataset: 'hashtags', platform: 'instagram' },
  { dataset: 'hashtags', platform: 'twitter' },
];

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

function edge(source: string, target: string): WorkflowEdge {
  return {
    id: `${source}-to-${target}`,
    source,
    target,
    targetHandle: 'previous',
  };
}

function refreshNodes(includeExpiration: boolean): WorkflowVisualNode[] {
  const nodes: WorkflowVisualNode[] = [];
  if (includeExpiration) {
    nodes.push(
      actionNode(
        TRENDS_MAINTENANCE_ACTION_IDS.EXPIRE_TRENDS,
        'expire-trends',
        0,
        ['request'],
      ),
      actionNode(
        TRENDS_MAINTENANCE_ACTION_IDS.EXPIRE_VIDEOS,
        'expire-videos',
        120,
        ['request'],
      ),
      actionNode(
        TRENDS_MAINTENANCE_ACTION_IDS.EXPIRE_HASHTAGS,
        'expire-hashtags',
        240,
        ['request'],
      ),
      actionNode(
        TRENDS_MAINTENANCE_ACTION_IDS.EXPIRE_SOUNDS,
        'expire-sounds',
        360,
        ['request'],
      ),
    );
  }
  const offset = includeExpiration ? 480 : 0;
  nodes.push(
    actionNode(
      TRENDS_MAINTENANCE_ACTION_IDS.FETCH_GLOBAL,
      'fetch-global',
      offset,
      ['request'],
    ),
    actionNode('workflow.for-each', 'refresh-datasets', offset + 120, [], {
      childWorkflowId: TRENDS_MAINTENANCE_WORKFLOW_IDS.DATASET_TASK,
      itemInputKey: 'task',
      items: DATASET_TASKS,
      maxConcurrency: 3,
      mode: 'await',
    }),
    actionNode(
      TRENDS_MAINTENANCE_ACTION_IDS.FETCH_SOUNDS,
      'fetch-sounds',
      offset + 240,
      ['request'],
    ),
    actionNode(
      TRENDS_MAINTENANCE_ACTION_IDS.PRECOMPUTE_PREVIEW,
      'precompute-preview',
      offset + 360,
      ['request'],
    ),
  );
  return nodes;
}

function refreshEdges(includeExpiration: boolean): WorkflowEdge[] {
  const order = [
    ...(includeExpiration
      ? ['expire-trends', 'expire-videos', 'expire-hashtags', 'expire-sounds']
      : []),
    'fetch-global',
    'refresh-datasets',
    'fetch-sounds',
    'precompute-preview',
  ];
  return order
    .slice(1)
    .map((target, index) => edge(order[index] ?? 'expire-hashtags', target));
}

function maintenanceDefinition(
  canonicalId: string,
  label: string,
  includeExpiration: boolean,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: refreshEdges(includeExpiration),
      inputVariables: [
        {
          key: 'request',
          label: 'Trend maintenance request',
          required: true,
          type: 'json',
        },
      ],
      nodes: refreshNodes(includeExpiration),
    },
    description:
      'Refreshes global trend datasets through explicit atomic maintenance actions.',
    label,
    resultNodeId: 'precompute-preview',
    version: 1,
  };
}

export function buildTrendDatasetTaskWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: TRENDS_MAINTENANCE_WORKFLOW_IDS.DATASET_TASK,
    definition: {
      edges: [],
      inputVariables: [
        { key: 'task', label: 'Dataset task', required: true, type: 'json' },
      ],
      nodes: [
        actionNode(
          TRENDS_MAINTENANCE_ACTION_IDS.FETCH_DATASET,
          'fetch-dataset',
          0,
          ['task'],
        ),
      ],
    },
    description: 'Fetches one platform-specific trend dataset.',
    label: 'Trend Dataset Task',
    resultNodeId: 'fetch-dataset',
    version: 1,
  };
}

export function buildTrendsRefreshWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return maintenanceDefinition(
    TRENDS_MAINTENANCE_WORKFLOW_IDS.REFRESH,
    'Global Trends Refresh',
    true,
  );
}

export function buildTrendsBackfillWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const shouldBackfill: WorkflowVisualNode = {
    data: {
      config: {
        customField: 'shouldBackfill',
        field: 'custom',
        operator: 'isTrue',
      },
      label: 'Backfill required?',
    },
    id: 'should-backfill',
    position: { x: 0, y: 120 },
    type: 'condition',
  };
  const refresh = refreshNodes(true).map((node) => ({
    ...node,
    position: { x: 0, y: node.position.y + 240 },
  }));
  return {
    canonicalId: TRENDS_MAINTENANCE_WORKFLOW_IDS.BACKFILL,
    definition: {
      edges: [
        {
          id: 'evaluate-to-condition',
          source: 'evaluate-backfill',
          target: 'should-backfill',
          targetHandle: 'value',
        },
        {
          id: 'condition-to-expire',
          source: 'should-backfill',
          sourceHandle: 'true',
          target: 'expire-trends',
          targetHandle: 'evaluation',
        },
        ...refreshEdges(true),
        {
          id: 'condition-skip-to-finalize',
          source: 'should-backfill',
          sourceHandle: 'false',
          target: 'finalize-backfill',
          targetHandle: 'evaluation',
        },
        {
          id: 'refresh-to-finalize',
          source: 'precompute-preview',
          target: 'finalize-backfill',
          targetHandle: 'refresh',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Trend backfill request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(
          TRENDS_MAINTENANCE_ACTION_IDS.EVALUATE_BACKFILL,
          'evaluate-backfill',
          0,
          ['request'],
        ),
        shouldBackfill,
        ...refresh,
        actionNode(
          TRENDS_MAINTENANCE_ACTION_IDS.FINALIZE_BACKFILL,
          'finalize-backfill',
          1200,
          ['request'],
        ),
      ],
    },
    description:
      'Evaluates corpus health, conditionally refreshes datasets, and records adaptive backfill state.',
    label: 'Global Trends Backfill',
    resultNodeId: 'finalize-backfill',
    version: 1,
  };
}

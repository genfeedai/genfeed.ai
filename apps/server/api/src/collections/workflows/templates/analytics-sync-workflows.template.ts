import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type AnalyticsSyncWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

export const ANALYTICS_SYNC_ACTION_IDS = {
  DISCOVER_POSTS: 'analytics.posts.discover',
  FACEBOOK_COLLECT: 'analytics.facebook.collect',
  FINALIZE_COLLECTION: 'analytics.collection.finalize',
  GENERIC_DETECT_ALERTS: 'analytics.generic.detect-alerts',
  GENERIC_DISCOVER: 'analytics.generic.discover',
  GENERIC_PERSIST: 'analytics.generic.persist',
  GENERIC_RESOLVE_WINDOW: 'analytics.generic.resolve-window',
  GENERIC_SYNC_MEMORY: 'analytics.generic.sync-memory',
  SOCIAL_COLLECT: 'analytics.social.collect',
  THREADS_COLLECT: 'analytics.threads.collect',
  TWITTER_COLLECT: 'analytics.twitter.collect',
  YOUTUBE_COLLECT: 'analytics.youtube.collect',
} as const;

type CollectionActionId =
  | typeof ANALYTICS_SYNC_ACTION_IDS.FACEBOOK_COLLECT
  | typeof ANALYTICS_SYNC_ACTION_IDS.SOCIAL_COLLECT
  | typeof ANALYTICS_SYNC_ACTION_IDS.THREADS_COLLECT
  | typeof ANALYTICS_SYNC_ACTION_IDS.TWITTER_COLLECT
  | typeof ANALYTICS_SYNC_ACTION_IDS.YOUTUBE_COLLECT;

export const ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS = {
  FACEBOOK: 'analytics.facebook.collect-item',
  SOCIAL: 'analytics.social.collect-item',
  THREADS: 'analytics.threads.collect-item',
  TWITTER: 'analytics.twitter.collect-item',
  YOUTUBE: 'analytics.youtube.collect-item',
} as const;

export const ANALYTICS_GENERIC_SYNC_ITEM_WORKFLOW_ID =
  'analytics.generic.sync-item';

function actionNode(
  actionId: string,
  id: string,
  label: string,
  y: number,
  config: Record<string, unknown> = {},
) {
  return createTemplateActionNode(actionId, {
    data: { config, label },
    id,
    position: { x: 0, y },
  });
}

function collectionTemplate(params: {
  analyticsEnabledOnly: boolean;
  childWorkflowId: string;
  description: string;
  icon: string;
  id: string;
  name: string;
  platforms: string[];
  schedule: string;
}): AnalyticsSyncWorkflowTemplate {
  return {
    category: 'analytics',
    changeSummary:
      'Split due-post discovery, bounded provider collection, and collection-state finalization into action-backed workflow nodes.',
    description: params.description,
    edges: [
      {
        id: 'posts-to-fanout',
        source: 'discover-posts',
        sourceHandle: 'posts',
        target: 'collect-each-post',
        targetHandle: 'items',
      },
      {
        id: 'fanout-to-finalize',
        source: 'collect-each-post',
        target: 'finalize-collection',
        targetHandle: 'collection',
      },
    ],
    icon: params.icon,
    id: params.id,
    name: params.name,
    nodes: [
      actionNode(
        ANALYTICS_SYNC_ACTION_IDS.DISCOVER_POSTS,
        'discover-posts',
        'Discover due published posts',
        0,
        {
          analyticsEnabledOnly: params.analyticsEnabledOnly,
          platforms: params.platforms,
        },
      ),
      actionNode(
        'workflow.for-each',
        'collect-each-post',
        'Collect each post through its child workflow',
        220,
        {
          childWorkflowId: params.childWorkflowId,
          interItemDelayMs: 100,
          itemInputKey: 'item',
          maxConcurrency: 5,
          mode: 'scheduled',
        },
      ),
      actionNode(
        ANALYTICS_SYNC_ACTION_IDS.FINALIZE_COLLECTION,
        'finalize-collection',
        'Finalize analytics collection',
        440,
      ),
    ],
    schedule: params.schedule,
    version: 2,
  };
}

const GENERIC_ANALYTICS_SYNC_TEMPLATE: AnalyticsSyncWorkflowTemplate = {
  category: 'analytics',
  changeSummary:
    'Split incremental-window resolution from analytics synchronization into action-backed workflow nodes.',
  description: 'Six-hour per-organization incremental analytics sync.',
  edges: [
    {
      id: 'window-to-discovery',
      source: 'resolve-window',
      target: 'discover-analytics',
      targetHandle: 'window',
    },
    {
      id: 'discovery-to-fanout',
      source: 'discover-analytics',
      sourceHandle: 'items',
      target: 'sync-each-item',
      targetHandle: 'items',
    },
  ],
  icon: 'refresh-cw',
  id: 'analytics-sync',
  inputVariables: [
    {
      key: 'brandId',
      label: 'Brand ID',
      required: false,
      type: 'string',
    },
    {
      key: 'since',
      label: 'Sync since',
      required: false,
      type: 'string',
    },
  ],
  name: 'Analytics Sync',
  nodes: [
    actionNode(
      ANALYTICS_SYNC_ACTION_IDS.GENERIC_RESOLVE_WINDOW,
      'resolve-window',
      'Resolve analytics window',
      0,
    ),
    actionNode(
      ANALYTICS_SYNC_ACTION_IDS.GENERIC_DISCOVER,
      'discover-analytics',
      'Discover analytics records',
      240,
    ),
    actionNode(
      'workflow.for-each',
      'sync-each-item',
      'Persist each analytics record through its child workflow',
      480,
      {
        childWorkflowId: ANALYTICS_GENERIC_SYNC_ITEM_WORKFLOW_ID,
        interItemDelayMs: 50,
        itemInputKey: 'item',
        maxConcurrency: 5,
        mode: 'scheduled',
      },
    ),
  ],
  schedule: '0 */6 * * *',
  version: 2,
};

export const ANALYTICS_SYNC_WORKFLOW_TEMPLATES = [
  collectionTemplate({
    analyticsEnabledOnly: true,
    childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.FACEBOOK,
    description:
      'Hourly Facebook analytics collection for due published posts.',
    icon: 'bar-chart-3',
    id: 'analytics-facebook-sync',
    name: 'Facebook Analytics Sync',
    platforms: ['facebook'],
    schedule: '0 * * * *',
  }),
  collectionTemplate({
    analyticsEnabledOnly: true,
    childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.SOCIAL,
    description:
      'Hourly social analytics collection for due Instagram, LinkedIn, Mastodon, TikTok, and Pinterest posts.',
    icon: 'bar-chart-3',
    id: 'analytics-social-sync',
    name: 'Social Analytics Sync',
    platforms: ['instagram', 'linkedin', 'mastodon', 'pinterest', 'tiktok'],
    schedule: '0 * * * *',
  }),
  collectionTemplate({
    analyticsEnabledOnly: true,
    childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.THREADS,
    description: 'Hourly Threads analytics collection for due published posts.',
    icon: 'bar-chart-3',
    id: 'analytics-threads-sync',
    name: 'Threads Analytics Sync',
    platforms: ['threads'],
    schedule: '0 * * * *',
  }),
  collectionTemplate({
    analyticsEnabledOnly: false,
    childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.TWITTER,
    description: 'Half-hour X analytics collection for due published posts.',
    icon: 'bar-chart-3',
    id: 'analytics-twitter-sync',
    name: 'Twitter Analytics Sync',
    platforms: ['twitter'],
    schedule: '*/30 * * * *',
  }),
  GENERIC_ANALYTICS_SYNC_TEMPLATE,
  collectionTemplate({
    analyticsEnabledOnly: false,
    childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.YOUTUBE,
    description:
      'Hourly YouTube analytics collection for due published videos.',
    icon: 'youtube',
    id: 'youtube-analytics-sync',
    name: 'YouTube Analytics Sync',
    platforms: ['youtube'],
    schedule: '0 * * * *',
  }),
] satisfies AnalyticsSyncWorkflowTemplate[];

function collectionChildWorkflow(
  canonicalId: string,
  actionId: CollectionActionId,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'item',
          label: 'Analytics post',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createTemplateActionNode(actionId, {
          data: {
            config: {},
            inputVariableKeys: ['item'],
            label,
          },
          id: 'collect-post',
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: `${label} for one discovered post.`,
    label,
    resultNodeId: 'collect-post',
    version: 1,
  };
}

export const ANALYTICS_COLLECTION_CHILD_WORKFLOWS = [
  collectionChildWorkflow(
    ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.FACEBOOK,
    ANALYTICS_SYNC_ACTION_IDS.FACEBOOK_COLLECT,
    'Collect Facebook analytics',
  ),
  collectionChildWorkflow(
    ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.SOCIAL,
    ANALYTICS_SYNC_ACTION_IDS.SOCIAL_COLLECT,
    'Collect social analytics',
  ),
  collectionChildWorkflow(
    ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.THREADS,
    ANALYTICS_SYNC_ACTION_IDS.THREADS_COLLECT,
    'Collect Threads analytics',
  ),
  collectionChildWorkflow(
    ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.TWITTER,
    ANALYTICS_SYNC_ACTION_IDS.TWITTER_COLLECT,
    'Collect X analytics',
  ),
  collectionChildWorkflow(
    ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.YOUTUBE,
    ANALYTICS_SYNC_ACTION_IDS.YOUTUBE_COLLECT,
    'Collect YouTube analytics',
  ),
] satisfies SystemWorkflowGraphDefinition[];

export const ANALYTICS_GENERIC_CHILD_WORKFLOWS = [
  {
    canonicalId: ANALYTICS_GENERIC_SYNC_ITEM_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'persist-to-memory',
          source: 'persist-performance',
          target: 'sync-brand-memory',
          targetHandle: 'persisted',
        },
        {
          id: 'memory-to-alerts',
          source: 'sync-brand-memory',
          target: 'detect-alerts',
          targetHandle: 'persisted',
        },
      ],
      inputVariables: [
        {
          key: 'item',
          label: 'Analytics record',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createTemplateActionNode(ANALYTICS_SYNC_ACTION_IDS.GENERIC_PERSIST, {
          data: {
            config: {},
            inputVariableKeys: ['item'],
            label: 'Persist content performance',
          },
          id: 'persist-performance',
          position: { x: 0, y: 0 },
        }),
        actionNode(
          ANALYTICS_SYNC_ACTION_IDS.GENERIC_SYNC_MEMORY,
          'sync-brand-memory',
          'Sync brand memory',
          220,
        ),
        actionNode(
          ANALYTICS_SYNC_ACTION_IDS.GENERIC_DETECT_ALERTS,
          'detect-alerts',
          'Detect performance alerts',
          440,
        ),
      ],
    },
    description:
      'Persists one discovered analytics record and updates its learning loop.',
    label: 'Sync analytics record',
    resultNodeId: 'detect-alerts',
    version: 1,
  },
] satisfies SystemWorkflowGraphDefinition[];

import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type AdAutomationWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

export const AD_AUTOMATION_ACTION_IDS = {
  DISCOVER_CREDENTIALS: 'ads.credentials.discover',
  GOOGLE_FETCH: 'ads.google.performance.fetch',
  GOOGLE_NORMALIZE: 'ads.google.performance.normalize',
  META_FETCH: 'ads.meta.performance.fetch',
  META_NORMALIZE: 'ads.meta.performance.normalize',
  OPTIMIZATION_ANALYZE: 'ads.optimization.analyze',
  OPTIMIZATION_FINALIZE: 'ads.optimization.finalize',
  OPTIMIZATION_LOAD_CONFIG: 'ads.optimization.load-config',
  OPTIMIZATION_PERSIST: 'ads.optimization.persist-recommendations',
  PERSIST_PERFORMANCE: 'ads.performance.persist',
  TIKTOK_FETCH: 'ads.tiktok.performance.fetch',
  TIKTOK_NORMALIZE: 'ads.tiktok.performance.normalize',
} as const;

type ActionId =
  (typeof AD_AUTOMATION_ACTION_IDS)[keyof typeof AD_AUTOMATION_ACTION_IDS];

export const AD_SYNC_CHILD_WORKFLOW_IDS = {
  GOOGLE: 'ads.google.sync-credential',
  META: 'ads.meta.sync-credential',
  TIKTOK: 'ads.tiktok.sync-credential',
} as const;

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

function providerSyncTemplate(params: {
  description: string;
  childWorkflowId: string;
  icon: string;
  id: string;
  name: string;
  platform: 'facebook' | 'google_ads' | 'tiktok';
  schedule: string;
}): AdAutomationWorkflowTemplate {
  return {
    category: 'ads',
    changeSummary:
      'Split credential discovery, provider collection, normalization, and persistence into action-backed workflow nodes.',
    description: params.description,
    edges: [
      {
        id: 'credentials-to-fanout',
        source: 'discover-credentials',
        sourceHandle: 'credentials',
        target: 'sync-each-credential',
        targetHandle: 'items',
      },
    ],
    icon: params.icon,
    id: params.id,
    name: params.name,
    nodes: [
      actionNode(
        AD_AUTOMATION_ACTION_IDS.DISCOVER_CREDENTIALS,
        'discover-credentials',
        'Discover connected credentials',
        0,
        { platform: params.platform },
      ),
      actionNode(
        'workflow.for-each',
        'sync-each-credential',
        'Sync each credential through its child workflow',
        180,
        {
          childWorkflowId: params.childWorkflowId,
          interItemDelayMs: 1000,
          itemInputKey: 'item',
          maxConcurrency: 2,
          mode: 'scheduled',
        },
      ),
    ],
    schedule: params.schedule,
    version: 2,
  };
}

const AD_OPTIMIZATION_TEMPLATE: AdAutomationWorkflowTemplate = {
  category: 'ads',
  changeSummary:
    'Split optimization configuration, analysis, recommendation persistence, and audit finalization into action-backed workflow nodes.',
  description:
    'Daily per-organization ad optimization for enabled optimization configs.',
  edges: [
    {
      id: 'config-to-analysis',
      source: 'load-config',
      target: 'analyze-performance',
      targetHandle: 'optimization',
    },
    {
      id: 'analysis-to-persistence',
      source: 'analyze-performance',
      target: 'persist-recommendations',
      targetHandle: 'analysis',
    },
    {
      id: 'config-to-finalize',
      source: 'load-config',
      target: 'finalize-audit',
      targetHandle: 'optimization',
    },
    {
      id: 'analysis-to-finalize',
      source: 'analyze-performance',
      target: 'finalize-audit',
      targetHandle: 'analysis',
    },
    {
      id: 'persistence-to-finalize',
      source: 'persist-recommendations',
      target: 'finalize-audit',
      targetHandle: 'persistence',
    },
  ],
  icon: 'target',
  id: 'ad-optimization',
  name: 'Ad Optimization',
  nodes: [
    actionNode(
      AD_AUTOMATION_ACTION_IDS.OPTIMIZATION_LOAD_CONFIG,
      'load-config',
      'Load optimization configuration',
      0,
    ),
    actionNode(
      AD_AUTOMATION_ACTION_IDS.OPTIMIZATION_ANALYZE,
      'analyze-performance',
      'Analyze ad performance',
      180,
    ),
    actionNode(
      AD_AUTOMATION_ACTION_IDS.OPTIMIZATION_PERSIST,
      'persist-recommendations',
      'Persist recommendations',
      360,
    ),
    actionNode(
      AD_AUTOMATION_ACTION_IDS.OPTIMIZATION_FINALIZE,
      'finalize-audit',
      'Finalize optimization audit',
      540,
    ),
  ],
  schedule: '0 4 * * *',
  version: 2,
};

export const AD_AUTOMATION_WORKFLOW_TEMPLATES = [
  AD_OPTIMIZATION_TEMPLATE,
  providerSyncTemplate({
    description:
      'Daily Google Ads performance synchronization for connected Google Ads credentials.',
    childWorkflowId: AD_SYNC_CHILD_WORKFLOW_IDS.GOOGLE,
    icon: 'refresh-cw',
    id: 'ad-sync-google',
    name: 'Google Ads Sync',
    platform: 'google_ads',
    schedule: '30 3 * * *',
  }),
  providerSyncTemplate({
    description:
      'Daily Meta Ads performance synchronization for connected Facebook credentials.',
    childWorkflowId: AD_SYNC_CHILD_WORKFLOW_IDS.META,
    icon: 'refresh-cw',
    id: 'ad-sync-meta',
    name: 'Meta Ads Sync',
    platform: 'facebook',
    schedule: '0 3 * * *',
  }),
  providerSyncTemplate({
    description:
      'Daily TikTok Ads performance synchronization for connected TikTok credentials.',
    childWorkflowId: AD_SYNC_CHILD_WORKFLOW_IDS.TIKTOK,
    icon: 'refresh-cw',
    id: 'ad-sync-tiktok',
    name: 'TikTok Ads Sync',
    platform: 'tiktok',
    schedule: '0 4 * * *',
  }),
] satisfies AdAutomationWorkflowTemplate[];

function providerChildWorkflow(params: {
  canonicalId: string;
  fetchActionId: ActionId;
  label: string;
  normalizeActionId: ActionId;
}): SystemWorkflowGraphDefinition {
  return {
    canonicalId: params.canonicalId,
    definition: {
      edges: [
        {
          id: 'fetch-to-normalize',
          source: 'fetch-performance',
          target: 'normalize-performance',
          targetHandle: 'providerData',
        },
        {
          id: 'normalize-to-persist',
          source: 'normalize-performance',
          target: 'persist-performance',
          targetHandle: 'performance',
        },
      ],
      inputVariables: [
        {
          key: 'item',
          label: 'Credential reference',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createTemplateActionNode(params.fetchActionId, {
          data: {
            config: {},
            inputVariableKeys: ['item'],
            label: 'Fetch provider performance',
          },
          id: 'fetch-performance',
          position: { x: 0, y: 0 },
        }),
        actionNode(
          params.normalizeActionId,
          'normalize-performance',
          'Normalize provider performance',
          180,
        ),
        actionNode(
          AD_AUTOMATION_ACTION_IDS.PERSIST_PERFORMANCE,
          'persist-performance',
          'Persist ad performance',
          360,
        ),
      ],
    },
    description: `${params.label} for one connected credential.`,
    label: params.label,
    resultNodeId: 'persist-performance',
    version: 1,
  };
}

export const AD_SYNC_CHILD_WORKFLOWS = [
  providerChildWorkflow({
    canonicalId: AD_SYNC_CHILD_WORKFLOW_IDS.GOOGLE,
    fetchActionId: AD_AUTOMATION_ACTION_IDS.GOOGLE_FETCH,
    label: 'Sync Google Ads credential',
    normalizeActionId: AD_AUTOMATION_ACTION_IDS.GOOGLE_NORMALIZE,
  }),
  providerChildWorkflow({
    canonicalId: AD_SYNC_CHILD_WORKFLOW_IDS.META,
    fetchActionId: AD_AUTOMATION_ACTION_IDS.META_FETCH,
    label: 'Sync Meta Ads credential',
    normalizeActionId: AD_AUTOMATION_ACTION_IDS.META_NORMALIZE,
  }),
  providerChildWorkflow({
    canonicalId: AD_SYNC_CHILD_WORKFLOW_IDS.TIKTOK,
    fetchActionId: AD_AUTOMATION_ACTION_IDS.TIKTOK_FETCH,
    label: 'Sync TikTok Ads credential',
    normalizeActionId: AD_AUTOMATION_ACTION_IDS.TIKTOK_NORMALIZE,
  }),
] satisfies SystemWorkflowGraphDefinition[];

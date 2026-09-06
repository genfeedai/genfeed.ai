import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export const DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID = 'daily-publishing.account';
export const DAILY_PUBLISHING_ACTION_IDS = [
  'daily-publishing.resolve',
  'daily-publishing.refresh',
  'daily-publishing.collect-analytics',
  'daily-publishing.select',
  'daily-publishing.generate',
  'daily-publishing.evaluate',
  'daily-publishing.schedule',
] as const;
const node = (
  actionId: string,
  id: string,
  x: number,
  inputVariableKeys: string[] = [],
) =>
  createTemplateActionNode(actionId, {
    id,
    position: { x, y: 100 },
    data: { label: id, config: {}, inputVariableKeys },
  });
export const DAILY_PUBLISHING_TEMPLATE: WorkflowTemplate = {
  id: 'daily-brand-social-publishing',
  name: 'Daily Brand Social Publishing',
  category: 'content',
  icon: 'repeat',
  version: 1,
  description:
    'Daily X and LinkedIn content from fresh trends, account winners, and topics, using brand context. Creates quality-checked review drafts by default; enable automatic publishing explicitly.',
  schedule: '0 9 * * *',
  timezone: 'UTC',
  isScheduleEnabled: false,
  inputVariables: [
    { key: 'brandId', label: 'Brand ID', type: 'text', required: true },
    {
      key: 'credentialIds',
      label: 'Account IDs (empty selects connected X and LinkedIn accounts)',
      type: 'json',
      defaultValue: [],
      required: false,
    },
    {
      key: 'topics',
      label: 'Evergreen topics',
      type: 'json',
      defaultValue: [],
      required: false,
    },
    {
      key: 'timezone',
      label: 'Timezone',
      type: 'text',
      defaultValue: 'UTC',
      required: false,
    },
    {
      key: 'autoPublish',
      label: 'Automatically publish quality-approved content',
      type: 'boolean',
      defaultValue: false,
      required: false,
    },
    {
      key: 'minScore',
      label: 'Minimum quality score (7–10)',
      type: 'number',
      defaultValue: 8,
      required: false,
    },
    {
      key: 'agentStrategyId',
      label: 'Optional strategy attribution',
      type: 'text',
      required: false,
    },
  ],
  nodes: [
    node('daily-publishing.resolve', 'resolve-accounts', 0, [
      'brandId',
      'credentialIds',
      'topics',
      'timezone',
      'autoPublish',
      'minScore',
      'agentStrategyId',
    ]),
    node('daily-publishing.refresh', 'refresh-sources', 360),
    createTemplateActionNode('workflow.for-each', {
      id: 'publish-each-account',
      position: { x: 720, y: 100 },
      data: {
        label: 'Prepare each account daily slot',
        config: {
          childWorkflowId: DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID,
          itemInputKey: 'item',
          maxConcurrency: 1,
          mode: 'await',
          failureMode: 'collect',
        },
      },
    }),
  ],
  edges: [
    {
      id: 'accounts-sources',
      source: 'resolve-accounts',
      target: 'refresh-sources',
      targetHandle: 'state',
    },
    {
      id: 'sources-accounts',
      source: 'refresh-sources',
      sourceHandle: 'items',
      target: 'publish-each-account',
      targetHandle: 'items',
    },
  ],
};
export function dailyPublishingAccountDefinition(): SystemWorkflowGraphDefinition {
  const actions = [
    'collect-analytics',
    'select',
    'generate',
    'evaluate',
    'schedule',
  ];
  return {
    canonicalId: DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID,
    label: 'Daily Account Publishing',
    description:
      'Claim a daily account slot, select source, generate, evaluate, and schedule or hold for review.',
    version: 1,
    resultNodeId: 'schedule',
    definition: {
      inputVariables: [
        {
          key: 'item',
          label: 'Daily account slot',
          type: 'json',
          required: true,
        },
      ],
      nodes: actions.map((action, index) =>
        node(
          `daily-publishing.${action}`,
          action,
          index * 360,
          index === 0 ? ['item'] : [],
        ),
      ),
      edges: actions.slice(1).map((action, index) => ({
        id: `${actions[index]}-${action}`,
        source: actions[index],
        target: action,
        targetHandle: 'state',
      })),
    },
  };
}

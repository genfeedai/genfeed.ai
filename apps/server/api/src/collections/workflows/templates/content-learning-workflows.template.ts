import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
export const CONTENT_LEARNING_ACTION_IDS = {
  RECONCILE: 'content-learning.reconcile',
  CHECKPOINT: 'content-learning.checkpoint',
  ACCOUNT_REBUILD: 'content-learning.account-rebuild',
  DATASET_TRAIN: 'content-learning.dataset-train',
  EVALUATE: 'content-learning.evaluate',
  RETENTION: 'content-learning.retention',
} as const;
export type ContentLearningActionId =
  (typeof CONTENT_LEARNING_ACTION_IDS)[keyof typeof CONTENT_LEARNING_ACTION_IDS];
export const CONTENT_LEARNING_WORKFLOW_TEMPLATES: WorkflowTemplate[] =
  Object.values(CONTENT_LEARNING_ACTION_IDS).map((id) => ({
    id,
    name: id.replace('content-learning.', 'Content Learning '),
    category: 'analytics',
    version: 1,
    description:
      'Process scoped learning evidence and durable authorized operations.',
    changeSummary:
      'Persist evidence and receipts through the background workflow queue.',
    ...(id === CONTENT_LEARNING_ACTION_IDS.RECONCILE
      ? { schedule: '*/5 * * * *', isScheduleEnabled: true }
      : id === CONTENT_LEARNING_ACTION_IDS.RETENTION
        ? { schedule: '20 3 * * *', isScheduleEnabled: true }
        : { isScheduleEnabled: false }),
    inputVariables: [
      { key: 'postId', label: 'Post', type: 'text', required: false },
      { key: 'credentialId', label: 'Account', type: 'text', required: false },
      { key: 'scopeKey', label: 'Cell', type: 'text', required: false },
      {
        key: 'operationId',
        label: 'Authorized operation',
        type: 'text',
        required: false,
      },
    ],
    nodes: [
      createTemplateActionNode(id, {
        id: 'learning-action',
        position: { x: 0, y: 0 },
        data: {
          label: 'Process learning operation',
          config: {
            postId: '{{inputs.postId}}',
            credentialId: '{{inputs.credentialId}}',
            scopeKey: '{{inputs.scopeKey}}',
            operationId: '{{inputs.operationId}}',
          },
        },
      }),
    ],
    edges: [],
  }));

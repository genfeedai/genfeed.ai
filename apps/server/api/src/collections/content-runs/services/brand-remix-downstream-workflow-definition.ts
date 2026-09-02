import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const BRAND_REMIX_DOWNSTREAM_ACTION_IDS = {
  META_CREATE_AD: 'brand-remix.meta.create-ad',
  META_ENSURE_AD_SET: 'brand-remix.meta.ensure-ad-set',
  META_ENSURE_CAMPAIGN: 'brand-remix.meta.ensure-campaign',
  META_FIND_AD: 'brand-remix.meta.find-ad',
  META_PAUSE_AD: 'brand-remix.meta.pause-ad',
  META_PAUSE_AD_SET: 'brand-remix.meta.pause-ad-set',
  META_PAUSE_CAMPAIGN: 'brand-remix.meta.pause-campaign',
  META_PERSIST_LINEAGE: 'brand-remix.meta.persist-lineage',
  META_PERSIST_MAPPING: 'brand-remix.meta.persist-mapping',
  META_PREPARE_CREATIVE: 'brand-remix.meta.prepare-creative',
  META_RESOLVE_ACCOUNT: 'brand-remix.meta.resolve-account',
  META_VALIDATE_SOURCE: 'brand-remix.meta.validate-source',
  REVIEW_CLAIM: 'brand-remix.review.claim',
  REVIEW_COMPLETE: 'brand-remix.review.complete',
  REVIEW_CREATE_HANDOFF: 'brand-remix.review.create-handoff',
  REVIEW_PREPARE: 'brand-remix.review.prepare',
  REVIEW_PROJECT: 'brand-remix.review.project',
  REVIEW_RECORD_LINEAGE: 'brand-remix.review.record-lineage',
  X_ENSURE_CAMPAIGN: 'brand-remix.x.ensure-campaign',
  X_ENSURE_LINE_ITEM: 'brand-remix.x.ensure-line-item',
  X_ENSURE_PROMOTED_TWEET: 'brand-remix.x.ensure-promoted-tweet',
  X_PERSIST_LINEAGE: 'brand-remix.x.persist-lineage',
  X_PERSIST_MAPPING: 'brand-remix.x.persist-mapping',
  X_RESOLVE_ACCOUNT: 'brand-remix.x.resolve-account',
  X_RESOLVE_FUNDING: 'brand-remix.x.resolve-funding',
  X_VALIDATE_SOURCE: 'brand-remix.x.validate-source',
  X_VALIDATE_TWEET: 'brand-remix.x.validate-tweet',
} as const;

export const BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS = {
  META_PAUSED_DRAFT: 'brand-remix.meta.paused-draft',
  REVIEW_HANDOFF: 'brand-remix.review-handoff',
  X_PAUSED_DRAFT: 'brand-remix.x.paused-draft',
} as const;

function actionNode(
  actionId: string,
  id: string,
  y: number,
  inputVariableKeys: string[] = [],
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys,
    position: { x: 0, y },
  });
}

function edge(
  source: string,
  target: string,
  targetHandle = 'state',
): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    targetHandle,
  };
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

export function buildBrandRemixReviewWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.REVIEW_HANDOFF,
    definition: {
      edges: [
        edge('prepare-review', 'needs-handoff', 'value'),
        {
          id: 'needs-handoff-claim',
          source: 'needs-handoff',
          sourceHandle: 'true',
          target: 'claim-review',
          targetHandle: 'state',
        },
        {
          id: 'existing-review-project',
          source: 'needs-handoff',
          sourceHandle: 'false',
          target: 'project-review',
          targetHandle: 'state',
        },
        edge('claim-review', 'create-handoff'),
        edge('create-handoff', 'has-trend-lineage', 'value'),
        {
          id: 'has-trend-lineage-record',
          source: 'has-trend-lineage',
          sourceHandle: 'true',
          target: 'record-lineage',
          targetHandle: 'state',
        },
        {
          id: 'no-trend-lineage-complete',
          source: 'has-trend-lineage',
          sourceHandle: 'false',
          target: 'complete-review',
          targetHandle: 'state',
        },
        edge('record-lineage', 'complete-review'),
        edge('complete-review', 'project-review'),
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Review handoff',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_PREPARE,
          'prepare-review',
          0,
          ['request'],
        ),
        conditionNode(
          'needs-handoff',
          'Create review handoff?',
          'needsHandoff',
          140,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_CLAIM,
          'claim-review',
          280,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_CREATE_HANDOFF,
          'create-handoff',
          420,
        ),
        conditionNode(
          'has-trend-lineage',
          'Record trend lineage?',
          'recordTrendLineage',
          560,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_RECORD_LINEAGE,
          'record-lineage',
          700,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_COMPLETE,
          'complete-review',
          840,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_PROJECT,
          'project-review',
          980,
        ),
      ],
    },
    description:
      'Validates remix outputs, claims the review transition, creates canonical drafts, and projects the updated run.',
    label: 'Brand Remix Review Handoff',
    resultNodeId: 'project-review',
    version: 1,
  };
}

export function buildBrandRemixMetaPausedDraftWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.META_PAUSED_DRAFT,
    definition: {
      edges: [
        edge('validate-source', 'resolve-account'),
        edge('resolve-account', 'ensure-campaign'),
        edge('ensure-campaign', 'ensure-ad-set'),
        edge('ensure-ad-set', 'find-ad'),
        edge('find-ad', 'has-existing-ad', 'value'),
        {
          id: 'existing-ad-pause-campaign',
          source: 'has-existing-ad',
          sourceHandle: 'true',
          target: 'pause-campaign',
          targetHandle: 'state',
        },
        {
          id: 'missing-ad-prepare-creative',
          source: 'has-existing-ad',
          sourceHandle: 'false',
          target: 'prepare-creative',
          targetHandle: 'state',
        },
        edge('prepare-creative', 'create-ad'),
        edge('create-ad', 'pause-campaign'),
        edge('pause-campaign', 'pause-ad-set'),
        edge('pause-ad-set', 'pause-ad'),
        edge('pause-ad', 'persist-mapping'),
        edge('persist-mapping', 'persist-lineage'),
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Paused Meta draft',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_VALIDATE_SOURCE,
          'validate-source',
          0,
          ['request'],
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_RESOLVE_ACCOUNT,
          'resolve-account',
          120,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_ENSURE_CAMPAIGN,
          'ensure-campaign',
          240,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_ENSURE_AD_SET,
          'ensure-ad-set',
          360,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_FIND_AD,
          'find-ad',
          480,
        ),
        conditionNode(
          'has-existing-ad',
          'Ad already exists?',
          'hasExistingAd',
          600,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PREPARE_CREATIVE,
          'prepare-creative',
          720,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_CREATE_AD,
          'create-ad',
          840,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PAUSE_CAMPAIGN,
          'pause-campaign',
          960,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PAUSE_AD_SET,
          'pause-ad-set',
          1080,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PAUSE_AD,
          'pause-ad',
          1200,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PERSIST_MAPPING,
          'persist-mapping',
          1320,
        ),
        actionNode(
          BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PERSIST_LINEAGE,
          'persist-lineage',
          1440,
        ),
      ],
    },
    description:
      'Validates an approved remix, creates or reuses paused Meta objects, and records canonical lineage.',
    label: 'Brand Remix Paused Meta Draft',
    resultNodeId: 'persist-lineage',
    version: 1,
  };
}

export function buildBrandRemixXPausedDraftWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const steps = [
    ['validate-source', BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_VALIDATE_SOURCE],
    ['resolve-account', BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_RESOLVE_ACCOUNT],
    ['resolve-funding', BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_RESOLVE_FUNDING],
    ['validate-tweet', BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_VALIDATE_TWEET],
    ['ensure-campaign', BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_ENSURE_CAMPAIGN],
    ['ensure-line-item', BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_ENSURE_LINE_ITEM],
    [
      'ensure-promoted-tweet',
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_ENSURE_PROMOTED_TWEET,
    ],
    ['persist-mapping', BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_PERSIST_MAPPING],
    ['persist-lineage', BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_PERSIST_LINEAGE],
  ] as const;
  return {
    canonicalId: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.X_PAUSED_DRAFT,
    definition: {
      edges: steps
        .slice(1)
        .map(([target], index) =>
          edge(steps[index]?.[0] ?? 'validate-source', target),
        ),
      inputVariables: [
        {
          key: 'request',
          label: 'Paused X Ads draft',
          required: true,
          type: 'json',
        },
      ],
      nodes: steps.map(([id, actionId], index) =>
        actionNode(actionId, id, index * 140, index === 0 ? ['request'] : []),
      ),
    },
    description:
      'Validates an approved tweet, creates or reuses paused X Ads objects, and records canonical lineage.',
    label: 'Brand Remix Paused X Ads Draft',
    resultNodeId: 'persist-lineage',
    version: 1,
  };
}

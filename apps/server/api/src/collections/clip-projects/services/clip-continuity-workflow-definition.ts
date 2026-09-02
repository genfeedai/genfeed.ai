import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CLIP_CONTINUITY_WORKFLOW_ID = 'clip.continuity';
export const CLIP_CONTINUITY_QA_WORKFLOW_ID = 'clip.continuity.qa-one';
export const CLIP_CONTINUITY_FAILURE_WORKFLOW_ID = 'clip.continuity.failure';

export const CLIP_CONTINUITY_ACTION_IDS = {
  BEGIN: 'clip.continuity.begin',
  FAIL: 'clip.continuity.fail',
  PERSIST_REPORT: 'clip.continuity.persist-report',
} as const;

export function buildClipContinuityWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIP_CONTINUITY_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'begin-to-qa',
          source: 'begin-continuity',
          target: 'assess-clips',
          targetHandle: 'claim',
        },
        {
          id: 'qa-to-persist',
          source: 'assess-clips',
          target: 'persist-continuity-report',
          targetHandle: 'qaBatch',
        },
      ],
      inputVariables: [
        {
          key: 'projectId',
          label: 'Clip project ID',
          required: true,
          type: 'text',
        },
        {
          key: 'generationWorkflowExecutionId',
          label: 'Generation execution ID',
          required: true,
          type: 'text',
        },
        {
          key: 'clipDescriptors',
          label: 'Clip result descriptors',
          required: true,
          type: 'json',
        },
        {
          key: 'referenceAssetIds',
          label: 'Canonical reference asset IDs',
          required: true,
          type: 'json',
        },
        {
          key: 'items',
          label: 'Clip videos to assess',
          required: true,
          type: 'json',
        },
        {
          key: 'baseInput',
          label: 'Continuity reference inputs',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: CLIP_CONTINUITY_ACTION_IDS.BEGIN,
          id: 'begin-continuity',
          inputVariableKeys: ['projectId'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'assess-clips',
          inputVariableKeys: ['items', 'baseInput'],
          parameters: {
            childWorkflowId: CLIP_CONTINUITY_QA_WORKFLOW_ID,
            itemInputKey: 'video',
            maxConcurrency: 3,
            mode: 'await',
          },
          position: { x: 0, y: 160 },
        }),
        createGenfeedActionNode({
          actionId: CLIP_CONTINUITY_ACTION_IDS.PERSIST_REPORT,
          id: 'persist-continuity-report',
          inputVariableKeys: [
            'projectId',
            'generationWorkflowExecutionId',
            'clipDescriptors',
            'referenceAssetIds',
          ],
          position: { x: 0, y: 320 },
        }),
      ],
    },
    description:
      'Assesses completed clips through one registered child workflow and persists an aggregate continuity report.',
    label: 'Clip Continuity QA',
    resultNodeId: 'persist-continuity-report',
    version: 1,
  };
}

export function buildClipContinuityQaWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIP_CONTINUITY_QA_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'video',
          label: 'Clip video',
          required: true,
          type: 'video',
        },
        {
          key: 'characterReferenceUrls',
          label: 'Character reference URLs',
          required: true,
          type: 'json',
        },
        {
          key: 'productReferenceUrls',
          label: 'Product reference URLs',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: 'videoQa',
          id: 'assess-clip',
          inputVariableKeys: [
            'video',
            'characterReferenceUrls',
            'productReferenceUrls',
          ],
          parameters: {
            blackDurationSeconds: 0.5,
            freezeDurationSeconds: 2,
            inputVideoKey: 'video',
            isContactSheetEnabled: true,
            isContinuityQaEnabled: true,
          },
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: 'Runs canonical continuity QA for one completed clip.',
    label: 'Assess One Clip for Continuity',
    resultNodeId: 'assess-clip',
    version: 1,
  };
}

export function buildClipContinuityFailureWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIP_CONTINUITY_FAILURE_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'projectId',
          label: 'Failed clip project ID',
          required: true,
          type: 'text',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: CLIP_CONTINUITY_ACTION_IDS.FAIL,
          id: 'fail-continuity',
          inputVariableKeys: ['projectId'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: 'Projects terminal failure for one clip continuity run.',
    label: 'Fail Clip Continuity QA',
    resultNodeId: 'fail-continuity',
    version: 1,
  };
}

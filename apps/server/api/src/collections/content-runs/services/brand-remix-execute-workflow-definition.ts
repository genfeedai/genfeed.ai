import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const BRAND_REMIX_EXECUTE_ACTION_IDS = {
  ADOPT_ORPHANS: 'brand-remix.execute.adopt-orphans',
  CLAIM: 'brand-remix.execute.claim',
  DISPATCH_MEDIA: 'brand-remix.execute.dispatch-media',
  GENERATE_COPY: 'brand-remix.execute.generate-copy',
  PREPARE: 'brand-remix.execute.prepare',
  PROJECT: 'brand-remix.execute.project',
  RECONCILE: 'brand-remix.execute.reconcile',
} as const;

export const BRAND_REMIX_EXECUTE_WORKFLOW_IDS = {
  EXECUTE: 'brand-remix.execute',
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
  sourceHandle?: string,
): WorkflowEdge {
  return {
    id: `${source}-${target}${sourceHandle ? `-${sourceHandle}` : ''}`,
    source,
    ...(sourceHandle ? { sourceHandle } : {}),
    target,
    targetHandle,
  };
}

export function buildBrandRemixExecuteWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: BRAND_REMIX_EXECUTE_WORKFLOW_IDS.EXECUTE,
    definition: {
      edges: [
        edge('prepare', 'claim'),
        edge('claim', 'adopt-orphans'),
        edge('adopt-orphans', 'generate-copy'),
        edge('generate-copy', 'dispatch-media'),
        edge('dispatch-media', 'reconcile'),
        edge('reconcile', 'project'),
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Brand Remix start',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(BRAND_REMIX_EXECUTE_ACTION_IDS.PREPARE, 'prepare', 0, [
          'request',
        ]),
        actionNode(BRAND_REMIX_EXECUTE_ACTION_IDS.CLAIM, 'claim', 140),
        actionNode(
          BRAND_REMIX_EXECUTE_ACTION_IDS.ADOPT_ORPHANS,
          'adopt-orphans',
          280,
        ),
        actionNode(
          BRAND_REMIX_EXECUTE_ACTION_IDS.GENERATE_COPY,
          'generate-copy',
          420,
        ),
        actionNode(
          BRAND_REMIX_EXECUTE_ACTION_IDS.DISPATCH_MEDIA,
          'dispatch-media',
          560,
        ),
        actionNode(BRAND_REMIX_EXECUTE_ACTION_IDS.RECONCILE, 'reconcile', 700),
        actionNode(BRAND_REMIX_EXECUTE_ACTION_IDS.PROJECT, 'project', 840),
      ],
    },
    description:
      'Claims a Brand Remix run and executes every media variant through registered action executors.',
    label: 'Brand Remix Execute',
    resultNodeId: 'project',
    version: 1,
  };
}

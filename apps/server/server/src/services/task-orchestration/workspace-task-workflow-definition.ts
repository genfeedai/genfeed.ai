import { createGenfeedActionNode } from '@genfeedai/actions';
import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@server/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-definition';

export type WorkspaceTaskWorkflowRequest = {
  brandId?: string;
  brandName?: string;
  elevenlabsVoiceId?: string;
  heygenAvatarId?: string;
  organizationId: string;
  outputType?: string;
  platforms?: string[];
  request: string;
  taskId: string;
  userId: string;
  voiceId?: string;
  voiceProvider?: string;
};

export const WORKSPACE_TASK_WORKFLOW_IDS = {
  AGENT: 'workspace.task.execute-agent',
  AGENT_RUN: 'workspace.task.execute-agent-run',
  EXECUTE: 'workspace.task.execute',
  FACECAM: 'workspace.task.execute-facecam',
} as const;

export const WORKSPACE_TASK_ACTION_IDS = {
  AGENT_DECOMPOSE: 'workspace.task.agent.decompose',
  AGENT_LINK_RUNS: 'workspace.task.agent.link-runs',
  AGENT_PLAN_RUNS: 'workspace.task.agent.plan-runs',
  AGENT_RECORD_RUN: 'workspace.task.agent.record-run',
  AGENT_RUN_CREATE: 'workspace.task.agent.run.create',
  AGENT_RUN_ENQUEUE: 'workspace.task.agent.run.enqueue',
  FACECAM_ATTACH_OUTPUT: 'workspace.task.facecam.attach-output',
  FACECAM_GENERATE: 'workspace.task.facecam.generate',
  FACECAM_PREPARE: 'workspace.task.facecam.prepare',
  FACECAM_RECORD_DISPATCH: 'workspace.task.facecam.record-dispatch',
  FACECAM_RECORD_START: 'workspace.task.facecam.record-start',
  FACECAM_SCHEDULE_POLL: 'workspace.task.facecam.schedule-poll',
  FINALIZE: 'workspace.task.finalize',
  ROUTE: 'workspace.task.route',
} as const;

type WorkspaceTaskActionId =
  (typeof WORKSPACE_TASK_ACTION_IDS)[keyof typeof WORKSPACE_TASK_ACTION_IDS];

function actionNode(
  actionId: WorkspaceTaskActionId,
  id: string,
  y: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys: ['request'],
    position: { x: 0, y },
  });
}

function definition(
  canonicalId: string,
  label: string,
  description: string,
  nodes: WorkflowVisualNode[],
  edges: WorkflowEdge[],
  resultNodeId: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: `${label} request`,
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description,
    label,
    resultNodeId,
    version: 1,
  };
}

export function buildWorkspaceTaskWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const route = actionNode(WORKSPACE_TASK_ACTION_IDS.ROUTE, 'route-task', 0);
  const agent = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'execute-agent-task',
    parameters: {
      childWorkflowId: WORKSPACE_TASK_WORKFLOW_IDS.AGENT,
      itemInputKey: 'request',
      maxConcurrency: 1,
      mode: 'await',
    },
    position: { x: -180, y: 180 },
  });
  const facecam = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'execute-facecam-task',
    parameters: {
      childWorkflowId: WORKSPACE_TASK_WORKFLOW_IDS.FACECAM,
      itemInputKey: 'request',
      maxConcurrency: 1,
      mode: 'await',
    },
    position: { x: 180, y: 180 },
  });
  const finalize = actionNode(
    WORKSPACE_TASK_ACTION_IDS.FINALIZE,
    'finalize-task',
    360,
  );

  return definition(
    WORKSPACE_TASK_WORKFLOW_IDS.EXECUTE,
    'Execute Workspace Task',
    'Routes one workspace task into the explicit agent or facecam workflow and returns its durable result.',
    [route, agent, facecam, finalize],
    [
      {
        id: 'route-agent-items',
        source: route.id,
        sourceHandle: 'agentItems',
        target: agent.id,
        targetHandle: 'items',
      },
      {
        id: 'route-facecam-items',
        source: route.id,
        sourceHandle: 'facecamItems',
        target: facecam.id,
        targetHandle: 'items',
      },
      {
        id: 'agent-result-to-finalize',
        source: agent.id,
        target: finalize.id,
        targetHandle: 'agentBatch',
      },
      {
        id: 'facecam-result-to-finalize',
        source: facecam.id,
        target: finalize.id,
        targetHandle: 'facecamBatch',
      },
    ],
    finalize.id,
  );
}

export function buildWorkspaceAgentTaskWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const decompose = actionNode(
    WORKSPACE_TASK_ACTION_IDS.AGENT_DECOMPOSE,
    'decompose-task',
    0,
  );
  const planRuns = actionNode(
    WORKSPACE_TASK_ACTION_IDS.AGENT_PLAN_RUNS,
    'plan-agent-runs',
    160,
  );
  const executeRuns = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'execute-agent-runs',
    parameters: {
      childWorkflowId: WORKSPACE_TASK_WORKFLOW_IDS.AGENT_RUN,
      itemInputKey: 'request',
      maxConcurrency: 1,
      mode: 'await',
    },
    position: { x: 0, y: 320 },
  });
  const linkRuns = actionNode(
    WORKSPACE_TASK_ACTION_IDS.AGENT_LINK_RUNS,
    'link-agent-runs',
    480,
  );

  return definition(
    WORKSPACE_TASK_WORKFLOW_IDS.AGENT,
    'Execute Agent Workspace Task',
    'Decomposes one workspace task, creates and queues one child workflow per agent run, then links the runs to the task.',
    [decompose, planRuns, executeRuns, linkRuns],
    [
      {
        id: 'decomposition-to-plan',
        source: decompose.id,
        target: planRuns.id,
        targetHandle: 'state',
      },
      {
        id: 'planned-runs-to-fan-out',
        source: planRuns.id,
        sourceHandle: 'items',
        target: executeRuns.id,
        targetHandle: 'items',
      },
      {
        id: 'run-results-to-link',
        source: executeRuns.id,
        target: linkRuns.id,
        targetHandle: 'batch',
      },
    ],
    linkRuns.id,
  );
}

export function buildWorkspaceAgentRunWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const sequence = [
    ['create-run', WORKSPACE_TASK_ACTION_IDS.AGENT_RUN_CREATE],
    ['enqueue-run', WORKSPACE_TASK_ACTION_IDS.AGENT_RUN_ENQUEUE],
    ['record-run', WORKSPACE_TASK_ACTION_IDS.AGENT_RECORD_RUN],
  ] as const;
  const nodes = sequence.map(([id, actionId], index) =>
    actionNode(actionId, id, index * 160),
  );
  const edges: WorkflowEdge[] = sequence.slice(1).map(([id], index) => ({
    id: `${sequence[index]?.[0]}-to-${id}`,
    source: sequence[index]?.[0] ?? '',
    target: id,
    targetHandle: 'state',
  }));

  return definition(
    WORKSPACE_TASK_WORKFLOW_IDS.AGENT_RUN,
    'Execute Workspace Agent Run',
    'Creates one agent run, queues it through the existing durable agent-run transport, and records the task event.',
    nodes,
    edges,
    'record-run',
  );
}

export function buildWorkspaceFacecamTaskWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const sequence = [
    ['prepare-facecam', WORKSPACE_TASK_ACTION_IDS.FACECAM_PREPARE],
    ['record-facecam-start', WORKSPACE_TASK_ACTION_IDS.FACECAM_RECORD_START],
    ['generate-facecam', WORKSPACE_TASK_ACTION_IDS.FACECAM_GENERATE],
    ['attach-facecam-output', WORKSPACE_TASK_ACTION_IDS.FACECAM_ATTACH_OUTPUT],
    [
      'record-facecam-dispatch',
      WORKSPACE_TASK_ACTION_IDS.FACECAM_RECORD_DISPATCH,
    ],
    ['schedule-facecam-poll', WORKSPACE_TASK_ACTION_IDS.FACECAM_SCHEDULE_POLL],
  ] as const;
  const nodes = sequence.map(([id, actionId], index) =>
    actionNode(actionId, id, index * 160),
  );
  const edges: WorkflowEdge[] = sequence.slice(1).map(([id], index) => ({
    id: `${sequence[index]?.[0]}-to-${id}`,
    source: sequence[index]?.[0] ?? '',
    target: id,
    targetHandle: 'state',
  }));

  return definition(
    WORKSPACE_TASK_WORKFLOW_IDS.FACECAM,
    'Execute Facecam Workspace Task',
    'Prepares, generates, attaches, records, and arranges delivery tracking for one facecam video.',
    nodes,
    edges,
    'schedule-facecam-poll',
  );
}

export const WORKSPACE_TASK_WORKFLOW_DEFINITIONS = [
  buildWorkspaceAgentRunWorkflowDefinition(),
  buildWorkspaceAgentTaskWorkflowDefinition(),
  buildWorkspaceFacecamTaskWorkflowDefinition(),
  buildWorkspaceTaskWorkflowDefinition(),
] satisfies SystemWorkflowGraphDefinition[];

export function findWorkspaceTaskWorkflowDefinition(
  canonicalId: string,
): SystemWorkflowGraphDefinition {
  const definition = WORKSPACE_TASK_WORKFLOW_DEFINITIONS.find(
    (candidate) => candidate.canonicalId === canonicalId,
  );
  if (!definition) {
    throw new Error(`Unknown workspace task workflow: ${canonicalId}`);
  }
  return definition;
}

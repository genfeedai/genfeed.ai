import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

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
  AGENT_EXECUTION: 'workspace.task.execute-agent-execution',
  EXECUTE: 'workspace.task.execute',
  FACECAM: 'workspace.task.execute-facecam',
} as const;

export const WORKSPACE_TASK_ACTION_IDS = {
  AGENT_DECOMPOSE: 'workspace.task.agent.decompose',
  AGENT_ENQUEUE_EXECUTION: 'workspace.task.agent.enqueue-execution',
  AGENT_LINK_EXECUTIONS: 'workspace.task.agent.link-executions',
  AGENT_PLAN_EXECUTIONS: 'workspace.task.agent.plan-executions',
  FACECAM_FINALIZE: 'workspace.task.facecam.finalize',
  FACECAM_FINALIZE_FAILURE: 'workspace.task.facecam.finalize-failure',
  FACECAM_GENERATE: 'workspace.task.facecam.generate',
  FACECAM_PREPARE: 'workspace.task.facecam.prepare',
  FACECAM_RECORD_START: 'workspace.task.facecam.record-start',
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
  const planExecutions = actionNode(
    WORKSPACE_TASK_ACTION_IDS.AGENT_PLAN_EXECUTIONS,
    'plan-agent-executions',
    160,
  );
  const executeExecutions = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'execute-agent-executions',
    parameters: {
      childWorkflowId: WORKSPACE_TASK_WORKFLOW_IDS.AGENT_EXECUTION,
      itemInputKey: 'request',
      maxConcurrency: 1,
      mode: 'await',
    },
    position: { x: 0, y: 320 },
  });
  const linkExecutions = actionNode(
    WORKSPACE_TASK_ACTION_IDS.AGENT_LINK_EXECUTIONS,
    'link-agent-executions',
    480,
  );

  return definition(
    WORKSPACE_TASK_WORKFLOW_IDS.AGENT,
    'Execute Agent Workspace Task',
    'Decomposes one workspace task, enqueues one child agent-turn workflow per subtask, then links the executions to the task.',
    [decompose, planExecutions, executeExecutions, linkExecutions],
    [
      {
        id: 'decomposition-to-plan',
        source: decompose.id,
        target: planExecutions.id,
        targetHandle: 'state',
      },
      {
        id: 'planned-executions-to-fan-out',
        source: planExecutions.id,
        sourceHandle: 'items',
        target: executeExecutions.id,
        targetHandle: 'items',
      },
      {
        id: 'execution-results-to-link',
        source: executeExecutions.id,
        target: linkExecutions.id,
        targetHandle: 'batch',
      },
    ],
    linkExecutions.id,
  );
}

export function buildWorkspaceAgentExecutionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const enqueue = actionNode(
    WORKSPACE_TASK_ACTION_IDS.AGENT_ENQUEUE_EXECUTION,
    'enqueue-agent-execution',
    0,
  );

  return definition(
    WORKSPACE_TASK_WORKFLOW_IDS.AGENT_EXECUTION,
    'Enqueue Workspace Agent Execution',
    'Enqueues one agent-turn workflow execution for a decomposed workspace task subtask.',
    [enqueue],
    [],
    enqueue.id,
  );
}

export function buildWorkspaceFacecamTaskWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const sequence = [
    ['prepare-facecam', WORKSPACE_TASK_ACTION_IDS.FACECAM_PREPARE],
    ['record-facecam-start', WORKSPACE_TASK_ACTION_IDS.FACECAM_RECORD_START],
    ['generate-facecam', WORKSPACE_TASK_ACTION_IDS.FACECAM_GENERATE],
    ['finalize-facecam', WORKSPACE_TASK_ACTION_IDS.FACECAM_FINALIZE],
  ] as const;
  const nodes = sequence.map(([id, actionId], index) =>
    actionNode(actionId, id, index * 160),
  );
  nodes.push(
    actionNode(
      WORKSPACE_TASK_ACTION_IDS.FACECAM_FINALIZE_FAILURE,
      'finalize-facecam-failure',
      640,
    ),
  );
  const edges: WorkflowEdge[] = sequence.slice(1).map(([id], index) => ({
    id: `${sequence[index]?.[0]}-to-${id}`,
    source: sequence[index]?.[0] ?? '',
    target: id,
    targetHandle: 'state',
  }));
  edges.push({
    id: 'generate-facecam-to-failure',
    source: 'generate-facecam',
    sourceHandle: 'failure',
    target: 'finalize-facecam-failure',
    targetHandle: 'failure',
  });

  return definition(
    WORKSPACE_TASK_WORKFLOW_IDS.FACECAM,
    'Execute Facecam Workspace Task',
    'Prepares one facecam video, suspends on its provider continuation, then atomically attaches and records the final output.',
    nodes,
    edges,
    'finalize-facecam',
  );
}

export const WORKSPACE_TASK_WORKFLOW_DEFINITIONS = [
  buildWorkspaceAgentExecutionWorkflowDefinition(),
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

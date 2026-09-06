import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const AGENT_RUNTIME_WORKFLOW_IDS = {
  INPUT_RESPONSE: 'agent.thread.input-response',
  TURN: 'agent.turn.execute',
  UI_ACTION: 'agent.thread.ui-action',
  VOICE_GENERATION: 'voice.generate',
} as const;

export const AGENT_CONVERSATION_WORKFLOW_IDS: readonly string[] = [
  AGENT_RUNTIME_WORKFLOW_IDS.TURN,
  AGENT_RUNTIME_WORKFLOW_IDS.UI_ACTION,
  AGENT_RUNTIME_WORKFLOW_IDS.INPUT_RESPONSE,
];

export const AGENT_RUNTIME_ACTION_IDS = {
  INPUT_RESPONSE: 'agent.thread.input-response.execute',
  TURN_FAIL: 'agent.turn.fail',
  TURN_FINALIZE: 'agent.turn.finalize',
  TURN_INFER: 'agent.turn.infer',
  TURN_PREPARE: 'agent.turn.prepare',
  UI_ACTION: 'agent.thread.ui-action.execute',
  VOICE_GENERATION: 'voice.generate.execute',
} as const;

function actionNode(
  actionId: (typeof AGENT_RUNTIME_ACTION_IDS)[keyof typeof AGENT_RUNTIME_ACTION_IDS],
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

export function buildAgentTurnWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const prepare = actionNode(
    AGENT_RUNTIME_ACTION_IDS.TURN_PREPARE,
    'prepare-turn',
    0,
    ['request'],
  );
  const infer = actionNode(
    AGENT_RUNTIME_ACTION_IDS.TURN_INFER,
    'infer-turn',
    180,
  );
  const finalize = actionNode(
    AGENT_RUNTIME_ACTION_IDS.TURN_FINALIZE,
    'finalize-turn',
    360,
  );
  const fail = actionNode(
    AGENT_RUNTIME_ACTION_IDS.TURN_FAIL,
    'fail-turn',
    540,
    ['request'],
  );
  const edges: WorkflowEdge[] = [
    {
      id: 'prepare-to-infer',
      source: prepare.id,
      sourceHandle: 'state',
      target: infer.id,
      targetHandle: 'state',
    },
    {
      id: 'infer-final-to-finalize',
      source: infer.id,
      sourceHandle: 'final',
      target: finalize.id,
      targetHandle: 'final',
    },
    {
      id: 'infer-state-to-finalize',
      source: infer.id,
      sourceHandle: 'state',
      target: finalize.id,
      targetHandle: 'state',
    },
    {
      id: 'prepare-failure-to-fail',
      source: prepare.id,
      sourceHandle: 'failure',
      target: fail.id,
      targetHandle: 'failure',
    },
    {
      id: 'infer-failure-to-fail',
      source: infer.id,
      sourceHandle: 'failure',
      target: fail.id,
      targetHandle: 'failure',
    },
    {
      id: 'finalize-failure-to-fail',
      source: finalize.id,
      sourceHandle: 'failure',
      target: fail.id,
      targetHandle: 'failure',
    },
  ];

  return {
    canonicalId: AGENT_RUNTIME_WORKFLOW_IDS.TURN,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Agent turn request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [prepare, infer, finalize, fail],
    },
    description:
      'Executes one durable agent turn through registered preparation, inference, finalization, and failure actions.',
    label: 'Execute Agent Turn',
    resultNodeId: finalize.id,
    version: 2,
  };
}

function singleActionWorkflow(options: {
  actionId:
    | typeof AGENT_RUNTIME_ACTION_IDS.INPUT_RESPONSE
    | typeof AGENT_RUNTIME_ACTION_IDS.UI_ACTION
    | typeof AGENT_RUNTIME_ACTION_IDS.VOICE_GENERATION;
  canonicalId:
    | typeof AGENT_RUNTIME_WORKFLOW_IDS.INPUT_RESPONSE
    | typeof AGENT_RUNTIME_WORKFLOW_IDS.UI_ACTION
    | typeof AGENT_RUNTIME_WORKFLOW_IDS.VOICE_GENERATION;
  description: string;
  inputKeys: string[];
  inputVariables: Array<{
    key: string;
    label: string;
    required: boolean;
    type: 'json' | 'string';
  }>;
  label: string;
}): SystemWorkflowGraphDefinition {
  const execute = actionNode(options.actionId, 'execute', 0, options.inputKeys);
  return {
    canonicalId: options.canonicalId,
    definition: {
      edges: [],
      inputVariables: options.inputVariables,
      nodes: [execute],
    },
    description: options.description,
    label: options.label,
    resultNodeId: execute.id,
    version: 1,
  };
}

export function buildAgentUiActionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleActionWorkflow({
    actionId: AGENT_RUNTIME_ACTION_IDS.UI_ACTION,
    canonicalId: AGENT_RUNTIME_WORKFLOW_IDS.UI_ACTION,
    description:
      'Executes one authorized thread UI action through the workflow runtime.',
    inputKeys: ['request'],
    inputVariables: [
      {
        key: 'request',
        label: 'Thread UI action request',
        required: true,
        type: 'json',
      },
    ],
    label: 'Execute Agent Thread UI Action',
  });
}

export function buildAgentInputResponseWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleActionWorkflow({
    actionId: AGENT_RUNTIME_ACTION_IDS.INPUT_RESPONSE,
    canonicalId: AGENT_RUNTIME_WORKFLOW_IDS.INPUT_RESPONSE,
    description:
      'Resumes one paused agent thread operation with validated human input.',
    inputKeys: ['request'],
    inputVariables: [
      {
        key: 'request',
        label: 'Thread input response',
        required: true,
        type: 'json',
      },
    ],
    label: 'Resume Agent Thread Input',
  });
}

export function buildVoiceGenerationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleActionWorkflow({
    actionId: AGENT_RUNTIME_ACTION_IDS.VOICE_GENERATION,
    canonicalId: AGENT_RUNTIME_WORKFLOW_IDS.VOICE_GENERATION,
    description:
      'Generates and persists one text-to-speech ingredient through a registered action.',
    inputKeys: ['ingredientId', 'organizationId', 'text', 'userId', 'voiceId'],
    inputVariables: [
      {
        key: 'ingredientId',
        label: 'Ingredient',
        required: true,
        type: 'string',
      },
      {
        key: 'organizationId',
        label: 'Organization',
        required: true,
        type: 'string',
      },
      { key: 'text', label: 'Text', required: true, type: 'string' },
      { key: 'userId', label: 'User', required: true, type: 'string' },
      { key: 'voiceId', label: 'Voice', required: true, type: 'string' },
    ],
    label: 'Generate Voice',
  });
}

export const AGENT_RUNTIME_WORKFLOW_DEFINITIONS = [
  buildAgentTurnWorkflowDefinition(),
  buildAgentUiActionWorkflowDefinition(),
  buildAgentInputResponseWorkflowDefinition(),
  buildVoiceGenerationWorkflowDefinition(),
] satisfies SystemWorkflowGraphDefinition[];

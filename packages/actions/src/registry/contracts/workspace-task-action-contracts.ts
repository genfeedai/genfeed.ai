import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const REQUEST_PROPERTIES = {
  brandId: STRING_SCHEMA,
  brandName: STRING_SCHEMA,
  elevenlabsVoiceId: STRING_SCHEMA,
  heygenAvatarId: STRING_SCHEMA,
  organizationId: STRING_SCHEMA,
  outputType: STRING_SCHEMA,
  platforms: arraySchema(STRING_SCHEMA),
  request: STRING_SCHEMA,
  taskId: STRING_SCHEMA,
  userId: STRING_SCHEMA,
  voiceId: STRING_SCHEMA,
  voiceProvider: STRING_SCHEMA,
} as const;
const REQUEST_REQUIRED = [
  'organizationId',
  'request',
  'taskId',
  'userId',
] as const;
const REQUEST = closedObjectSchema(REQUEST_PROPERTIES, REQUEST_REQUIRED);
const SUBTASK = closedObjectSchema(
  {
    agentType: STRING_SCHEMA,
    brief: STRING_SCHEMA,
    label: STRING_SCHEMA,
    order: NUMBER_SCHEMA,
  },
  ['agentType', 'brief', 'label', 'order'],
);
const DECOMPOSITION = closedObjectSchema(
  {
    isSingleAgent: BOOLEAN_SCHEMA,
    routingSummary: STRING_SCHEMA,
    subtasks: arraySchema(SUBTASK),
  },
  ['isSingleAgent', 'routingSummary', 'subtasks'],
);
const DECOMPOSED_STATE = closedObjectSchema(
  { ...REQUEST_PROPERTIES, decomposition: DECOMPOSITION },
  [...REQUEST_REQUIRED, 'decomposition'],
);
const AGENT_EXECUTION_ITEM = closedObjectSchema(
  { ...REQUEST_PROPERTIES, subtask: SUBTASK },
  [...REQUEST_REQUIRED, 'subtask'],
);
const AGENT_EXECUTION_STATE = closedObjectSchema(
  { ...REQUEST_PROPERTIES, executionId: STRING_SCHEMA, subtask: SUBTASK },
  [...REQUEST_REQUIRED, 'executionId', 'subtask'],
);
const LINKED_EXECUTIONS = closedObjectSchema(
  { executionIds: arraySchema(STRING_SCHEMA), taskId: STRING_SCHEMA },
  ['executionIds', 'taskId'],
);
const GENERATION = closedObjectSchema(
  {
    avatarId: STRING_SCHEMA,
    clonedVoiceId: STRING_SCHEMA,
    heygenVoiceId: STRING_SCHEMA,
    text: STRING_SCHEMA,
    useIdentity: BOOLEAN_SCHEMA,
    voiceProvider: STRING_SCHEMA,
  },
  ['text', 'useIdentity'],
);
const FACECAM_PROPERTIES = {
  ...REQUEST_PROPERTIES,
  externalId: STRING_SCHEMA,
  generation: GENERATION,
  ingredientId: STRING_SCHEMA,
  resolvedVoiceProvider: STRING_SCHEMA,
} as const;
const FACECAM_STATE = closedObjectSchema(FACECAM_PROPERTIES, [
  ...REQUEST_REQUIRED,
  'generation',
  'resolvedVoiceProvider',
]);
const COMPLETED_FACECAM_STATE = closedObjectSchema(FACECAM_PROPERTIES, [
  ...REQUEST_REQUIRED,
  'externalId',
  'generation',
  'ingredientId',
  'resolvedVoiceProvider',
]);
const TRACKED_FACECAM_STATE = closedObjectSchema(
  {
    ...FACECAM_PROPERTIES,
    tracking: { enum: ['continuation'], type: 'string' },
  },
  [
    ...REQUEST_REQUIRED,
    'externalId',
    'generation',
    'ingredientId',
    'resolvedVoiceProvider',
    'tracking',
  ],
);
const requestInput = (
  additions: Readonly<Record<string, ActionJsonSchema>> = {},
  required: readonly string[] = [],
) =>
  closedObjectSchema({ request: REQUEST, ...additions }, [
    'request',
    ...required,
  ]);
const FACECAM_FAILURE = closedObjectSchema(
  {
    error: STRING_SCHEMA,
    failedNodeId: STRING_SCHEMA,
    nodeOutputs: JSON_DOCUMENT_SCHEMA,
  },
  ['error', 'failedNodeId', 'nodeOutputs'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'workspace.task.agent.decompose': {
    inputSchema: requestInput(),
    outputSchema: DECOMPOSED_STATE,
  },
  'workspace.task.agent.enqueue-execution': {
    inputSchema: closedObjectSchema({ request: AGENT_EXECUTION_ITEM }, [
      'request',
    ]),
    outputSchema: AGENT_EXECUTION_STATE,
  },
  'workspace.task.agent.link-executions': {
    inputSchema: requestInput({ batch: JSON_DOCUMENT_SCHEMA }, ['batch']),
    outputSchema: LINKED_EXECUTIONS,
  },
  'workspace.task.agent.plan-executions': {
    inputSchema: requestInput({ state: DECOMPOSED_STATE }, ['state']),
    outputSchema: closedObjectSchema(
      { items: arraySchema(AGENT_EXECUTION_ITEM) },
      ['items'],
    ),
  },
  'workspace.task.facecam.finalize': {
    inputSchema: requestInput({ state: COMPLETED_FACECAM_STATE }, ['state']),
    outputSchema: TRACKED_FACECAM_STATE,
  },
  'workspace.task.facecam.finalize-failure': {
    inputSchema: requestInput({ failure: FACECAM_FAILURE }, ['failure']),
    outputSchema: closedObjectSchema(
      {
        error: STRING_SCHEMA,
        failed: { const: true, type: 'boolean' },
        taskId: STRING_SCHEMA,
      },
      ['error', 'failed', 'taskId'],
    ),
  },
  'workspace.task.facecam.generate': {
    inputSchema: requestInput({ state: FACECAM_STATE }, ['state']),
    outputSchema: COMPLETED_FACECAM_STATE,
  },
  'workspace.task.facecam.prepare': {
    inputSchema: requestInput(),
    outputSchema: FACECAM_STATE,
  },
  'workspace.task.facecam.record-start': {
    inputSchema: requestInput({ state: FACECAM_STATE }, ['state']),
    outputSchema: FACECAM_STATE,
  },
  'workspace.task.finalize': {
    inputSchema: requestInput({
      agentBatch: JSON_DOCUMENT_SCHEMA,
      facecamBatch: JSON_DOCUMENT_SCHEMA,
    }),
    outputSchema: { oneOf: [LINKED_EXECUTIONS, TRACKED_FACECAM_STATE] },
  },
  'workspace.task.route': {
    inputSchema: requestInput(),
    outputSchema: closedObjectSchema(
      {
        agentItems: arraySchema(REQUEST),
        facecamItems: arraySchema(REQUEST),
      },
      ['agentItems', 'facecamItems'],
    ),
  },
};

export function getWorkspaceTaskActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}

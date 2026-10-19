import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

const EMPTY_TOOL_ITEMS = {
  items: JSON_DOCUMENT_SCHEMA,
  maxItems: 0,
  type: 'array',
} as const;
const TOOL_ITEM = closedObjectSchema(
  {
    canonicalId: {
      pattern: '^agent\\.tool\\.[A-Za-z0-9._-]+$',
      type: 'string',
    },
    idempotencyKey: STRING_SCHEMA,
    inputValues: JSON_DOCUMENT_SCHEMA,
  },
  ['canonicalId', 'idempotencyKey', 'inputValues'],
);
const INFERENCE = {
  oneOf: [
    closedObjectSchema(
      {
        decision: enumSchema(['final'] as const),
        final: JSON_DOCUMENT_SCHEMA,
        state: JSON_DOCUMENT_SCHEMA,
        toolItems: EMPTY_TOOL_ITEMS,
      },
      ['decision', 'final', 'state', 'toolItems'],
    ),
    closedObjectSchema(
      {
        decision: enumSchema(['tools'] as const),
        final: { type: 'null' },
        state: JSON_DOCUMENT_SCHEMA,
        toolItems: { items: TOOL_ITEM, minItems: 1, type: 'array' },
      },
      ['decision', 'final', 'state', 'toolItems'],
    ),
    closedObjectSchema(
      {
        decision: enumSchema(['exhausted'] as const),
        final: JSON_DOCUMENT_SCHEMA,
        state: JSON_DOCUMENT_SCHEMA,
        toolItems: EMPTY_TOOL_ITEMS,
      },
      ['decision', 'final', 'state', 'toolItems'],
    ),
  ],
} as const;

/**
 * What `AgentOrchestratorService` stamps on every queued thread request next to
 * the caller's own fields; the handlers read both back before executing.
 */
const THREAD_REQUEST_ORIGIN_PROPERTIES = {
  generationEntry: JSON_DOCUMENT_SCHEMA,
  initiatingPrincipal: JSON_DOCUMENT_SCHEMA,
} as const;

/** The `AgentChatResult` the UI-action handler returns as-is. */
const UI_ACTION_RESULT = closedObjectSchema(
  {
    brandId: nullableSchema(STRING_SCHEMA),
    contextVersion: INTEGER_SCHEMA,
    creditsRemaining: NUMBER_SCHEMA,
    creditsUsed: NUMBER_SCHEMA,
    message: closedObjectSchema(
      {
        content: STRING_SCHEMA,
        metadata: JSON_DOCUMENT_SCHEMA,
        role: STRING_SCHEMA,
      },
      ['content', 'metadata', 'role'],
    ),
    runOutcome: closedObjectSchema(
      { error: STRING_SCHEMA, status: enumSchema(['failed'] as const) },
      ['error', 'status'],
    ),
    threadId: STRING_SCHEMA,
    toolCalls: arraySchema(JSON_DOCUMENT_SCHEMA),
  },
  ['creditsRemaining', 'creditsUsed', 'message', 'threadId', 'toolCalls'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'agent.thread.input-response.execute': {
    inputSchema: closedObjectSchema(
      {
        request: closedObjectSchema(
          {
            answer: STRING_SCHEMA,
            fieldId: STRING_SCHEMA,
            ...THREAD_REQUEST_ORIGIN_PROPERTIES,
            scope: JSON_DOCUMENT_SCHEMA,
            threadId: STRING_SCHEMA,
          },
          ['answer', 'scope', 'threadId'],
        ),
      },
      ['request'],
    ),
    outputSchema: closedObjectSchema(
      {
        result: JSON_DOCUMENT_SCHEMA,
        resumeCursor: JSON_DOCUMENT_SCHEMA,
        resumed: { type: 'boolean' },
        threadId: STRING_SCHEMA,
      },
      ['resumed', 'threadId'],
    ),
  },
  'agent.thread.ui-action.execute': {
    inputSchema: closedObjectSchema(
      {
        request: closedObjectSchema(
          {
            action: STRING_SCHEMA,
            brandId: nullableSchema(STRING_SCHEMA),
            expectedContextVersion: INTEGER_SCHEMA,
            ...THREAD_REQUEST_ORIGIN_PROPERTIES,
            payload: JSON_DOCUMENT_SCHEMA,
            threadId: STRING_SCHEMA,
          },
          ['action', 'threadId'],
        ),
      },
      ['request'],
    ),
    outputSchema: UI_ACTION_RESULT,
  },
  'agent.turn.fail': {
    inputSchema: closedObjectSchema(
      {
        failure: JSON_DOCUMENT_SCHEMA,
        request: JSON_DOCUMENT_SCHEMA,
        state: nullableSchema(JSON_DOCUMENT_SCHEMA),
      },
      ['failure', 'request'],
    ),
    outputSchema: closedObjectSchema(
      { error: STRING_SCHEMA, threadId: nullableSchema(STRING_SCHEMA) },
      ['error'],
    ),
  },
  'agent.turn.finalize': {
    inputSchema: closedObjectSchema(
      { final: JSON_DOCUMENT_SCHEMA, state: JSON_DOCUMENT_SCHEMA },
      ['final', 'state'],
    ),
    outputSchema: closedObjectSchema(
      {
        artifactReferences: arraySchema(JSON_DOCUMENT_SCHEMA),
        artifactVersionPinIds: arraySchema(STRING_SCHEMA),
        content: STRING_SCHEMA,
        creditsUsed: INTEGER_SCHEMA,
        model: nullableSchema(STRING_SCHEMA),
        summary: STRING_SCHEMA,
        threadId: STRING_SCHEMA,
      },
      ['content', 'creditsUsed', 'summary', 'threadId'],
    ),
  },
  'agent.turn.infer': {
    inputSchema: closedObjectSchema(
      {
        state: JSON_DOCUMENT_SCHEMA,
        toolBatch: nullableSchema(JSON_DOCUMENT_SCHEMA),
      },
      ['state'],
    ),
    outputSchema: INFERENCE,
  },
  'agent.turn.prepare': {
    inputSchema: closedObjectSchema({ request: JSON_DOCUMENT_SCHEMA }, [
      'request',
    ]),
    outputSchema: closedObjectSchema(
      {
        brandId: nullableSchema(STRING_SCHEMA),
        contextVersion: INTEGER_SCHEMA,
        state: JSON_DOCUMENT_SCHEMA,
        threadId: STRING_SCHEMA,
      },
      ['contextVersion', 'state', 'threadId'],
    ),
  },
};

export function getAgentTurnActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}

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

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'agent.thread.input-response.execute': {
    inputSchema: closedObjectSchema(
      {
        request: closedObjectSchema(
          {
            answer: STRING_SCHEMA,
            fieldId: STRING_SCHEMA,
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
            payload: JSON_DOCUMENT_SCHEMA,
            threadId: STRING_SCHEMA,
          },
          ['action', 'threadId'],
        ),
      },
      ['request'],
    ),
    outputSchema: closedObjectSchema(
      {
        artifactReferences: arraySchema(JSON_DOCUMENT_SCHEMA),
        artifactVersionPinIds: arraySchema(STRING_SCHEMA),
        creditsUsed: NUMBER_SCHEMA,
        result: JSON_DOCUMENT_SCHEMA,
        threadId: STRING_SCHEMA,
      },
      ['creditsUsed', 'result', 'threadId'],
    ),
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

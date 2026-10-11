import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

/**
 * Scope of one detected breakout response. The initiating actor is deliberately absent: only the
 * server-persisted, pinned hidden execution may carry it, never node or caller input.
 */
const EXECUTION_REQUEST = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    responseId: STRING_SCHEMA,
    strategyId: STRING_SCHEMA,
  },
  [
    'brandId',
    'credentialId',
    'organizationId',
    'platform',
    'responseId',
    'strategyId',
  ],
);

const EXECUTION_RESULT = closedObjectSchema(
  {
    outputIds: arraySchema(STRING_SCHEMA),
    reason: nullableSchema(STRING_SCHEMA),
    responseId: STRING_SCHEMA,
    status: enumSchema(['completed', 'held', 'processing'] as const),
  },
  ['outputIds', 'reason', 'responseId', 'status'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'breakout.response.execute': {
    inputSchema: closedObjectSchema({ request: EXECUTION_REQUEST }, [
      'request',
    ]),
    outputSchema: EXECUTION_RESULT,
  },
};

export function getBreakoutResponseActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}

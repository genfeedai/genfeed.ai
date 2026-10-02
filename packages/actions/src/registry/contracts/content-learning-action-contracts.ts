import type { ActionContractSchemas } from './action-contract.interface';
import {
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

const outputSchema = closedObjectSchema(
  {
    status: STRING_SCHEMA,
    reason: nullableSchema(STRING_SCHEMA),
    failed: { type: 'integer', minimum: 0 },
    checkpointId: nullableSchema(STRING_SCHEMA),
    runStatus: nullableSchema(STRING_SCHEMA),
    queued: INTEGER_SCHEMA,
    removed: INTEGER_SCHEMA,
    policyId: nullableSchema(STRING_SCHEMA),
    operationId: STRING_SCHEMA,
    provenance: JSON_DOCUMENT_SCHEMA,
    result: JSON_DOCUMENT_SCHEMA,
  },
  ['status'],
);
const inputs: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['content-learning.reconcile', []],
  ['content-learning.checkpoint', ['postId']],
  ['content-learning.account-rebuild', ['credentialId', 'scopeKey']],
  ['content-learning.dataset-train', ['operationId']],
  ['content-learning.evaluate', ['operationId']],
  ['content-learning.retention', []],
];
const CONTRACTS: Record<string, ActionContractSchemas> = Object.fromEntries(
  inputs.map(([id, required]) => [
    id,
    {
      inputSchema: closedObjectSchema(
        {
          postId: STRING_SCHEMA,
          credentialId: STRING_SCHEMA,
          scopeKey: STRING_SCHEMA,
          operationId: STRING_SCHEMA,
          ...(id === 'content-learning.reconcile'
            ? {
                materializationOnly: BOOLEAN_SCHEMA,
                accountCursor: { type: 'string', minLength: 1, maxLength: 256 },
                scopeCursor: { type: 'string', minLength: 1, maxLength: 256 },
                refreshBucket: {
                  type: 'integer',
                  minimum: 0,
                  maximum: Number.MAX_SAFE_INTEGER,
                },
              }
            : {}),
        },
        required,
      ),
      outputSchema,
    },
  ]),
);
export function getContentLearningActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}

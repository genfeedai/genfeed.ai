import type { ActionContractSchemas } from './action-contract.interface';
import {
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  INTEGER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

/**
 * Starts a hired content agent's run from a trigger event (#10897). A step that
 * skips (cap, budget, replay) still completes and says why.
 */
const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  agentEventRun: {
    inputSchema: closedObjectSchema({
      dailyCap: INTEGER_SCHEMA,
      eventId: STRING_SCHEMA,
      eventText: STRING_SCHEMA,
      instruction: STRING_SCHEMA,
      strategyId: STRING_SCHEMA,
    }),
    outputSchema: closedObjectSchema({
      agentExecutionId: nullableSchema(STRING_SCHEMA),
      message: STRING_SCHEMA,
      reason: nullableSchema(STRING_SCHEMA),
      started: BOOLEAN_SCHEMA,
      threadId: nullableSchema(STRING_SCHEMA),
    }),
  },
};

export function getAgentEventRunActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}

import type { ActionContractSchemas } from './action-contract.interface';
import { closedObjectSchema, INTEGER_SCHEMA } from './schema-builders';

const IDS = new Set([
  'email-product-signals.dispatch',
  'email-product-signals.generations',
  'email-product-signals.conversions',
  'email-product-signals.receipts',
]);
export function getEmailProductSignalsActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return IDS.has(id)
    ? {
        inputSchema: closedObjectSchema({}),
        outputSchema: closedObjectSchema({ count: INTEGER_SCHEMA }, ['count']),
      }
    : undefined;
}

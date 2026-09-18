import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

/** Shared transport envelope returned by every Agent/MCP tool handler. */
export function toolActionOutputSchema(
  dataSchema: ActionJsonSchema,
): ActionJsonSchema {
  return closedObjectSchema(
    {
      creditsUsed: { minimum: 0, ...NUMBER_SCHEMA },
      data: dataSchema,
      error: STRING_SCHEMA,
      isBillingDelegated: BOOLEAN_SCHEMA,
      nextActions: arraySchema(JSON_DOCUMENT_SCHEMA),
      requiresConfirmation: BOOLEAN_SCHEMA,
      riskLevel: enumSchema(['high', 'low', 'medium'] as const),
      success: BOOLEAN_SCHEMA,
    },
    ['creditsUsed', 'success'],
  );
}

export const TOOL_ACTION_OUTPUT_SCHEMA: ActionJsonSchema =
  toolActionOutputSchema(JSON_DOCUMENT_SCHEMA);

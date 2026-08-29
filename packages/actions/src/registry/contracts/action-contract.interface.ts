import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';

export interface ActionContractSchemas {
  inputSchema: ActionJsonSchema;
  outputSchema: ActionJsonSchema;
}

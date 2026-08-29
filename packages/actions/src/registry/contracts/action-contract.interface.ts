import type { ActionJsonSchema } from '../../interfaces/action-definition.interface.js';

export interface ActionContractSchemas {
  inputSchema: ActionJsonSchema;
  outputSchema: ActionJsonSchema;
}

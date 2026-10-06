export type IngredientRecoveryGroup = 'attention' | 'retry' | 'unknown';

export interface IngredientRecovery {
  group: IngredientRecoveryGroup;
  reason:
    | 'serviceUnavailable'
    | 'missingReference'
    | 'invalidInputs'
    | 'requestRejected'
    | 'missingPrompt'
    | 'unsupportedRecovery'
    | 'unknown';
  action:
    | 'retry'
    | 'replaceReference'
    | 'reviewInputs'
    | 'editPrompt'
    | 'viewDetails';
}

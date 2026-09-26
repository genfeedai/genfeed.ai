import { createEntityAttributes } from '@genfeedai/helpers';

export const platformSettingAttributes = createEntityAttributes([
  'marginMultiplierGeneration',
  'marginMultiplierAgentChat',
  'marginInputMode',
  'typedDecisionProvider',
]);

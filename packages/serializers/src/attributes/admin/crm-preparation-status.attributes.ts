import { createEntityAttributes } from '@genfeedai/helpers';

export const crmPreparationStatusAttributes = createEntityAttributes([
  'batch',
  'brand',
  'claimedAt',
  'generatedAssetCount',
  'invitation',
  'inviteEligible',
  'organization',
  'paymentMadeAt',
  'prepPercent',
  'prepStage',
  'proactiveStatus',
]);

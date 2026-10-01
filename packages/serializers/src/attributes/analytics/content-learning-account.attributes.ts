import { createEntityAttributes } from '@genfeedai/helpers';
export const contentLearningAccountAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'credentialId',
  'mode',
  'revision',
  'epoch',
  'baselineCount',
  'activePolicyId',
  'activeConfigVersion',
  'sharingConsentVersion',
  'sharedReleasePreference',
  'pinnedReleaseId',
  'approvedArmIds',
  'pilotStartedAt',
  'failureReason',
  'driftState',
]);

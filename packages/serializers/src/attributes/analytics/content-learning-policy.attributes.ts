import { createEntityAttributes } from '@genfeedai/helpers';
export const contentLearningPolicyAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'credentialId',
  'scopeKey',
  'epoch',
  'version',
  'parentId',
  'algorithm',
  'configVersion',
  'featureSchema',
  'coefficients',
  'state',
  'synthetic',
]);

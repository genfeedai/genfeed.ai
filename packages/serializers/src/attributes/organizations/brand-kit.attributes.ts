import { createEntityAttributes } from '@genfeedai/helpers';

export const brandKitAttributes = createEntityAttributes([
  'brandId',
  'organizationId',
  'status',
  'sourceType',
  'fields',
  'assetCandidates',
  'evidence',
  'diagnostics',
  'readiness',
]);

export const brandKitApplyAttributes = createEntityAttributes([
  'brandId',
  'status',
  'appliedFields',
  'preservedFields',
  'diagnostics',
]);

export const brandKitAssetImportAttributes = createEntityAttributes([
  'brandId',
  'status',
  'importedAssetIds',
  'skippedCandidateIds',
  'failedCandidateIds',
  'results',
  'diagnostics',
]);

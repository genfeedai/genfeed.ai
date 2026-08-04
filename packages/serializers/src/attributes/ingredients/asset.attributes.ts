import { createEntityAttributes } from '@genfeedai/helpers';

export const assetAttributes = createEntityAttributes([
  'user',
  'parent',
  'parentModel',
  'parentType',
  'parentOrgId',
  'parentBrandId',
  'parentIngredientId',
  'parentArticleId',
  'category',
  // Absolute URL for the stored object. Not a column — resolved from
  // `cloudObjectKey` by whoever attaches the asset (see brand kit assets).
  'cdnUrl',
  'sha256',
  'sizeBytes',
  'mimeType',
  'kind',
  'origin',
  'residency',
  'uploadPolicy',
  'originalFileName',
  'displayName',
]);

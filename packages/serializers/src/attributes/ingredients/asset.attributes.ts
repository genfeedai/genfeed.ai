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

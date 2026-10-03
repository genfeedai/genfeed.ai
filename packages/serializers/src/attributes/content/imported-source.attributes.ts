import { createEntityAttributes } from '@genfeedai/helpers';
export const importedSourceAttributes = createEntityAttributes([
  'brandId',
  'recordVersion',
  'identityDigest',
  'snapshot',
  'recapturedFromIngredientId',
  'deduplicated',
  'createdAt',
  'updatedAt',
]).filter((field) => field !== 'isDeleted');

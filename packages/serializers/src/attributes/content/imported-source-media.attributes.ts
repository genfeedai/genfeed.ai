import { createEntityAttributes } from '@genfeedai/helpers';
export const importedSourceMediaAttributes = createEntityAttributes([
  'sourceId',
  'sourceRecordVersion',
  'sourceIdentityDigest',
  'bindingRevision',
  'state',
  'ingestRevision',
  'ingredientId',
  'artifact',
  'mediaKind',
  'errorCode',
  'canRetry',
]).filter((field) => field !== 'isDeleted');

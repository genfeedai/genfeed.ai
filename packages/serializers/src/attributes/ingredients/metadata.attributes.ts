import { createEntityAttributes } from '@genfeedai/helpers';

export const metadataAttributes = createEntityAttributes([
  'label',
  'description',
  'prompt',
  'model',
  'modelLabel',
  'style',
  'extension',
  'duration',
  'externalId',
  'width',
  'height',
  'size',
  'hasAudio',
  'result',
  'fps',
  'resolution',
]);

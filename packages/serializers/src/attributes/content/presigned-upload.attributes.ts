import { createEntityAttributes } from '@genfeedai/helpers';

export const presignedUploadAttributes = createEntityAttributes([
  'uploadUrl',
  'publicUrl',
  's3Key',
  'expiresIn',
]);

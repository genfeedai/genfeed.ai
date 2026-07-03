import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Release attachment: a first comment, thread segment, or signature attached to
 * a release or a specific channel target (#1124).
 */
export const releaseAttachmentAttributes = createEntityAttributes([
  'releaseId',
  'targetId',
  'kind',
  'platform',
  'body',
  'order',
]);

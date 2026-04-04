import { createEntityAttributes } from '@genfeedai/helpers';

export const distributionAttributes = createEntityAttributes([
  'organization',
  'user',
  'brand',
  'platform',
  'contentType',
  'text',
  'mediaUrl',
  'caption',
  'chatId',
  'status',
  'scheduledAt',
  'publishedAt',
  'errorMessage',
  'telegramMessageId',
]);

import { createEntityAttributes } from '@genfeedai/helpers';

export const announcementAttributes = createEntityAttributes([
  'authorId',
  'body',
  'channels',
  'discordChannelId',
  'discordMessageUrl',
  'isDeleted',
  'publishedAt',
  'tweetId',
  'tweetText',
  'tweetUrl',
]);

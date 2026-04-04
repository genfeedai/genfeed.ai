import { createEntityAttributes } from '@genfeedai/helpers';

export const botAttributes = createEntityAttributes([
  'organization',
  'brand',
  'user',
  'label',
  'description',
  'category',
  'status',
  'scope',
  'platforms',
  'targets',
  'settings',
  'engagementSettings',
  'monitoringSettings',
  'publishingSettings',
  'livestreamSettings',
  'messagesCount',
  'engagementsCount',
  'alertsTriggered',
  'postsPublished',
  'lastActivityAt',
]);

import { createEntityAttributes } from '@genfeedai/helpers';

export const settingAttributes = createEntityAttributes([
  'theme',
  'isVerified',
  'isFirstLogin',
  'isMenuCollapsed',
  'isAdvancedMode',
  'contentPreferences',
  'defaultAgentModel',
  'isAgentAssetsPanelOpen',
  'dashboardPreferences',
  'generationPriority',
  'isTrendNotificationsInApp',
  'isTrendNotificationsTelegram',
  'isTrendNotificationsEmail',
  'isWorkflowNotificationsEmail',
  'isVideoNotificationsEmail',
  'trendNotificationsTelegramChatId',
  'trendNotificationsEmailAddress',
  'trendNotificationsFrequency',
  'trendNotificationsMinViralScore',
]);

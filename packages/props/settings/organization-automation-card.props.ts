import type { IOrganizationSetting } from '@genfeedai/contracts/interfaces';

export type AutomationSettingKey = keyof Pick<
  IOrganizationSetting,
  | 'isBreakoutResponsesEnabled'
  | 'isBreakoutAutoPublishEnabled'
  | 'isBrandVisionChecksEnabled'
>;

export type AutomationSettingField = {
  key: AutomationSettingKey;
  messageKey: 'breakoutResponses' | 'breakoutAutoPublish' | 'brandVision';
};

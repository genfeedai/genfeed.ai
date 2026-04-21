import { DistributionPlatform } from '@genfeedai/enums';

export interface TelegramDistributeJobData {
  distributionId: string;
  organizationId: string;
  platform: DistributionPlatform;
}

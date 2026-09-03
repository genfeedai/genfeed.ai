import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IReferralProgram } from '@genfeedai/contracts/interfaces';

export class ReferralProgram extends BaseEntity implements IReferralProgram {
  declare public code: string;
  declare public shareUrl: string;
  declare public referralCount: number;
  declare public convertedCount: number;
  declare public pendingCredits: number;
  declare public earnedCredits: number;
  declare public reversedCredits: number;
  declare public rewardRatePercent: number;
  declare public rewardWindowMonths: number;
  declare public settlementDelayDays: number;
  declare public recentRewards: IReferralProgram['recentRewards'];

  constructor(data: Partial<IReferralProgram> = {}) {
    super(data);
  }
}

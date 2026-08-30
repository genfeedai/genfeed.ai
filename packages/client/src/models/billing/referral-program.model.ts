import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IReferralProgram } from '@genfeedai/interfaces';

export class ReferralProgram extends BaseEntity implements IReferralProgram {
  public declare code: string;
  public declare shareUrl: string;
  public declare referralCount: number;
  public declare convertedCount: number;
  public declare pendingCredits: number;
  public declare earnedCredits: number;
  public declare reversedCredits: number;
  public declare rewardRatePercent: number;
  public declare rewardWindowMonths: number;
  public declare settlementDelayDays: number;
  public declare recentRewards: IReferralProgram['recentRewards'];

  constructor(data: Partial<IReferralProgram> = {}) {
    super(data);
  }
}

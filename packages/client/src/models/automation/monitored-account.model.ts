import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ReplyBotPlatform } from '@genfeedai/enums';
import type { IMonitoredAccount } from '@genfeedai/interfaces';

export class MonitoredAccount extends BaseEntity implements IMonitoredAccount {
  public declare organization: string;
  public declare brand?: string;
  public declare user?: string;
  public declare botConfig?: string;
  public declare platform: ReplyBotPlatform;
  public declare externalId: string;
  public declare username: string;
  public declare displayName?: string;
  public declare avatarUrl?: string;
  public declare followersCount?: number;
  public declare bio?: string;
  public declare isActive: boolean;
  public declare lastCheckedAt?: string;
  public declare lastPostId?: string;

  constructor(data: Partial<IMonitoredAccount> = {}) {
    super(data);
  }
}

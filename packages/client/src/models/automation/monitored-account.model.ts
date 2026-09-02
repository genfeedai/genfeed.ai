import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ReplyBotPlatform } from '@genfeedai/contracts';
import type { IMonitoredAccount } from '@genfeedai/contracts/interfaces';

export class MonitoredAccount extends BaseEntity implements IMonitoredAccount {
  public declare organizationId: string;
  public declare brandId?: string;
  public declare userId: string;
  public declare botConfigId?: string;
  public declare credentialId?: string;
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

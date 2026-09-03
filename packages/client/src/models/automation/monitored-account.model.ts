import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ReplyBotPlatform } from '@genfeedai/contracts';
import type { IMonitoredAccount } from '@genfeedai/contracts/interfaces';

export class MonitoredAccount extends BaseEntity implements IMonitoredAccount {
  declare public organizationId: string;
  declare public brandId?: string;
  declare public userId: string;
  declare public botConfigId?: string;
  declare public credentialId?: string;
  declare public platform: ReplyBotPlatform;
  declare public externalId: string;
  declare public username: string;
  declare public displayName?: string;
  declare public avatarUrl?: string;
  declare public followersCount?: number;
  declare public bio?: string;
  declare public isActive: boolean;
  declare public lastCheckedAt?: string;
  declare public lastPostId?: string;

  constructor(data: Partial<IMonitoredAccount> = {}) {
    super(data);
  }
}

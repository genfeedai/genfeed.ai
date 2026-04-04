import type { IMonitoredAccount } from '@cloud/interfaces';
import { MonitoredAccount as BaseMonitoredAccount } from '@genfeedai/client/models';

export class MonitoredAccount extends BaseMonitoredAccount {
  constructor(partial: Partial<IMonitoredAccount> = {}) {
    super(partial);

    this.isActive = partial.isActive ?? true;
    this.followersCount = partial.followersCount ?? 0;
  }
}

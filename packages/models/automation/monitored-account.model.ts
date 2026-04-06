import { MonitoredAccount as BaseMonitoredAccount } from '@genfeedai/client/models';
import type { IMonitoredAccount } from '@genfeedai/interfaces';

export class MonitoredAccount extends BaseMonitoredAccount {
  constructor(partial: Partial<IMonitoredAccount> = {}) {
    super(partial);

    this.isActive = partial.isActive ?? true;
    this.followersCount = partial.followersCount ?? 0;
  }
}

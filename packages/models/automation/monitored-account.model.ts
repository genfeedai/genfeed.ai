import type { IMonitoredAccount } from '@genfeedai/interfaces';
import { MonitoredAccount as BaseMonitoredAccount } from '@genfeedai/client/models';

export class MonitoredAccount extends BaseMonitoredAccount {
  constructor(partial: Partial<IMonitoredAccount> = {}) {
    super(partial);

    this.isActive = partial.isActive ?? true;
    this.followersCount = partial.followersCount ?? 0;
  }
}

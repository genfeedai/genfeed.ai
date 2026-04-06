import { Organization as BaseOrganization } from '@genfeedai/client/models';
import type { IOrganization } from '@genfeedai/interfaces';
import { Credit } from '@models/billing/credit.model';
import { OrganizationSetting } from '@models/organization/organization-setting.model';

export class Organization extends BaseOrganization {
  prefix?: string;

  constructor(partial: Partial<IOrganization & { prefix?: string }>) {
    super(partial);
    this.prefix = partial.prefix;

    if (partial?.settings && typeof partial.settings === 'object') {
      this.settings = new OrganizationSetting(partial.settings);
    }

    if (partial?.credits && typeof partial.credits === 'object') {
      this.credits = new Credit(partial.credits);
    }
  }

  get balance(): number {
    return this.credits?.balance ?? 0;
  }

  get hasCredits(): boolean {
    return this.balance > 0;
  }
}

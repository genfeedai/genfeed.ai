import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  BillingAccountMemberRole,
  BillingAccountStatus,
} from '@genfeedai/contracts';
import type {
  IBillingAccount,
  IBillingAccountCapabilities,
  IBillingAccountMember,
  IBillingAccountOrganizationLink,
  IBillingAccountWallet,
} from '@genfeedai/contracts/interfaces';

export class BillingAccount extends BaseEntity implements IBillingAccount {
  declare public label: string | null;
  declare public status: BillingAccountStatus;
  declare public planTier: string | null;
  declare public callerRole: BillingAccountMemberRole | null;
  declare public linkedOrganizations: IBillingAccountOrganizationLink[];
  declare public wallet: IBillingAccountWallet;
  declare public subscriptionStatus: string | null;
  declare public currentPeriodEnd: string | null;
  declare public isIdentityStale: boolean;
  declare public capabilities: IBillingAccountCapabilities;
  declare public members?: IBillingAccountMember[];

  constructor(data: Partial<IBillingAccount> = {}) {
    super(data);
  }
}

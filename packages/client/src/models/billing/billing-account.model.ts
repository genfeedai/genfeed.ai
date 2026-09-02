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
  public declare label: string | null;
  public declare status: BillingAccountStatus;
  public declare planTier: string | null;
  public declare callerRole: BillingAccountMemberRole | null;
  public declare linkedOrganizations: IBillingAccountOrganizationLink[];
  public declare wallet: IBillingAccountWallet;
  public declare subscriptionStatus: string | null;
  public declare currentPeriodEnd: string | null;
  public declare isIdentityStale: boolean;
  public declare capabilities: IBillingAccountCapabilities;
  public declare members?: IBillingAccountMember[];

  constructor(data: Partial<IBillingAccount> = {}) {
    super(data);
  }
}

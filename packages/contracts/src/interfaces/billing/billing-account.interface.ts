import type {
  ActivitySource,
  BillingAccountBudgetPolicy,
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  BillingAccountStatus,
  CreditReservationStatus,
} from '../..';
import type { IBaseEntity } from '../core/base.interface';

export interface IBillingAccountWallet {
  available: number;
  held: number;
  settled: number;
}

export interface IBillingAccountOrganizationLink {
  organizationId: string;
  label: string;
  status: BillingAccountOrganizationStatus;
  usage: number;
  monthlyBudgetCredits: number | null;
  budgetPolicy: BillingAccountBudgetPolicy | null;
}

export interface IBillingAccountMember {
  userId: string;
  role: BillingAccountMemberRole;
}

export interface IBillingAccountCapabilities {
  canCheckout: boolean;
  canOpenPortal: boolean;
  canLinkOrganization: boolean;
  canDetachOrganization: boolean;
  canManageMembers: boolean;
  canManageBudgets: boolean;
}

export interface IBillingAccount extends IBaseEntity {
  label: string | null;
  status: BillingAccountStatus;
  planTier: string | null;
  callerRole: BillingAccountMemberRole | null;
  linkedOrganizations: IBillingAccountOrganizationLink[];
  wallet: IBillingAccountWallet;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  isIdentityStale: boolean;
  capabilities: IBillingAccountCapabilities;
}

export interface ICreditReservation extends IBaseEntity {
  billingAccountId: string;
  organizationId: string;
  actorUserId: string | null;
  amount: number;
  settledAmount: number | null;
  status: CreditReservationStatus;
  workloadType: string | null;
  workloadId: string | null;
  idempotencyKey: string;
  expiresAt: string;
}

export interface IReserveCreditsInput {
  organizationId: string;
  actorUserId: string;
  amount: number;
  idempotencyKey: string;
  workloadType?: string;
  workloadId?: string;
  expiresAt?: Date;
}

export interface ISettleCreditReservationInput {
  organizationId: string;
  reservationId?: string;
  idempotencyKey?: string;
  actualAmount: number;
  actorUserId: string;
  description: string;
  source?: ActivitySource;
}

export interface IReleaseCreditReservationInput {
  organizationId: string;
  reservationId?: string;
  idempotencyKey?: string;
  reason?: 'release' | 'expiry';
}

export interface ILinkOrganizationInput {
  billingAccountId: string;
  organizationId: string;
  actorUserId: string;
}

export interface IBillingAccountMigrationClassification {
  organizationId: string;
  classification:
    | 'unambiguous'
    | 'missing'
    | 'stale'
    | 'foreign'
    | 'duplicate'
    | 'ambiguous';
  reason: string;
}

export interface IBillingAccountMigrationReport {
  dryRun: boolean;
  classified: IBillingAccountMigrationClassification[];
  createdAccounts: number;
  linkedOrganizations: number;
  attributedTransactions: number;
  quarantined: number;
}

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
  /** Full snapshot, returned only to a caller holding a BillingAccountMember role. */
  kind: 'account';
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

/**
 * Reduced view returned to a caller who is an active member of an organization
 * linked to a billing account but holds no `BillingAccountMember` role there
 * (#5374). Carries only that organization's own usage/budget and whether it is
 * linked — never another linked organization's data, the account label, or
 * wallet internals.
 */
export interface IBillingAccountOwnOrganizationView {
  kind: 'organization';
  organizationId: string;
  isLinked: boolean;
  usage: number;
  monthlyBudgetCredits: number | null;
  budgetPolicy: BillingAccountBudgetPolicy | null;
  callerRole: null;
  capabilities: IBillingAccountCapabilities;
}

/** Either the full account snapshot or the reduced own-organization view — discriminate on `kind`. */
export type IBillingAccountSnapshot =
  | IBillingAccount
  | IBillingAccountOwnOrganizationView;

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
  /** Attached to the settlement ledger row (never prompt or completion text). */
  metadata?: Record<string, unknown>;
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

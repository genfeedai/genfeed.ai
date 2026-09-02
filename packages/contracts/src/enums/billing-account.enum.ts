export enum BillingAccountStatus {
  UNPROVISIONED = 'UNPROVISIONED',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  STALE = 'STALE',
}

export enum BillingAccountMemberRole {
  OWNER = 'OWNER',
  ADMINISTRATOR = 'ADMINISTRATOR',
  VIEWER = 'VIEWER',
}

export enum BillingAccountOrganizationStatus {
  LINKED = 'LINKED',
  DETACHED = 'DETACHED',
}

export enum CreditReservationStatus {
  RESERVED = 'RESERVED',
  SETTLED = 'SETTLED',
  RELEASED = 'RELEASED',
  EXPIRED = 'EXPIRED',
}

export enum BillingAccountBudgetPolicy {
  WARNING = 'WARNING',
  HARD_LIMIT = 'HARD_LIMIT',
}

const ROLE_RANK: Record<BillingAccountMemberRole, number> = {
  [BillingAccountMemberRole.VIEWER]: 1,
  [BillingAccountMemberRole.ADMINISTRATOR]: 2,
  [BillingAccountMemberRole.OWNER]: 3,
};

export function parseBillingAccountStatus(
  value: string | null | undefined,
): BillingAccountStatus {
  switch (value) {
    case BillingAccountStatus.UNPROVISIONED:
      return BillingAccountStatus.UNPROVISIONED;
    case BillingAccountStatus.ACTIVE:
      return BillingAccountStatus.ACTIVE;
    case BillingAccountStatus.PAST_DUE:
      return BillingAccountStatus.PAST_DUE;
    case BillingAccountStatus.CANCELLED:
      return BillingAccountStatus.CANCELLED;
    case BillingAccountStatus.STALE:
      return BillingAccountStatus.STALE;
    default:
      return BillingAccountStatus.UNPROVISIONED;
  }
}

export function parseBillingAccountMemberRole(
  value: string | null | undefined,
): BillingAccountMemberRole | null {
  switch (value) {
    case BillingAccountMemberRole.OWNER:
      return BillingAccountMemberRole.OWNER;
    case BillingAccountMemberRole.ADMINISTRATOR:
      return BillingAccountMemberRole.ADMINISTRATOR;
    case BillingAccountMemberRole.VIEWER:
      return BillingAccountMemberRole.VIEWER;
    default:
      return null;
  }
}

export function parseBillingAccountOrganizationStatus(
  value: string | null | undefined,
): BillingAccountOrganizationStatus {
  switch (value) {
    case BillingAccountOrganizationStatus.LINKED:
      return BillingAccountOrganizationStatus.LINKED;
    case BillingAccountOrganizationStatus.DETACHED:
      return BillingAccountOrganizationStatus.DETACHED;
    default:
      return BillingAccountOrganizationStatus.DETACHED;
  }
}

export function parseCreditReservationStatus(
  value: string | null | undefined,
): CreditReservationStatus {
  switch (value) {
    case CreditReservationStatus.RESERVED:
      return CreditReservationStatus.RESERVED;
    case CreditReservationStatus.SETTLED:
      return CreditReservationStatus.SETTLED;
    case CreditReservationStatus.RELEASED:
      return CreditReservationStatus.RELEASED;
    case CreditReservationStatus.EXPIRED:
      return CreditReservationStatus.EXPIRED;
    default:
      return CreditReservationStatus.RESERVED;
  }
}

export function billingAccountRoleSatisfies(
  actual: BillingAccountMemberRole | null | undefined,
  required: BillingAccountMemberRole,
): boolean {
  if (!actual) {
    return false;
  }

  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

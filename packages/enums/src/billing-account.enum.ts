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

export function billingAccountRoleSatisfies(
  actual: BillingAccountMemberRole | null | undefined,
  required: BillingAccountMemberRole,
): boolean {
  if (!actual) {
    return false;
  }

  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

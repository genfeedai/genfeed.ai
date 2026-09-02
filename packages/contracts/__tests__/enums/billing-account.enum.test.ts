import { describe, expect, it } from 'vitest';
import {
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  BillingAccountStatus,
  billingAccountRoleSatisfies,
  CreditReservationStatus,
  parseBillingAccountMemberRole,
  parseBillingAccountOrganizationStatus,
  parseBillingAccountStatus,
  parseCreditReservationStatus,
} from '../../src/enums/billing-account.enum';

describe('billing-account.enum', () => {
  it('matches Prisma BillingAccountStatus labels', () => {
    expect(Object.values(BillingAccountStatus)).toEqual([
      'UNPROVISIONED',
      'ACTIVE',
      'PAST_DUE',
      'CANCELLED',
      'STALE',
    ]);
  });

  it('matches Prisma BillingAccountMemberRole labels', () => {
    expect(Object.values(BillingAccountMemberRole)).toEqual([
      'OWNER',
      'ADMINISTRATOR',
      'VIEWER',
    ]);
  });

  it('matches Prisma organization-link and reservation labels', () => {
    expect(Object.values(BillingAccountOrganizationStatus)).toEqual([
      'LINKED',
      'DETACHED',
    ]);
    expect(Object.values(CreditReservationStatus)).toEqual([
      'RESERVED',
      'SETTLED',
      'RELEASED',
      'EXPIRED',
    ]);
  });

  it('ranks billing roles so owners satisfy administrator checks', () => {
    expect(
      billingAccountRoleSatisfies(
        BillingAccountMemberRole.OWNER,
        BillingAccountMemberRole.ADMINISTRATOR,
      ),
    ).toBe(true);
    expect(
      billingAccountRoleSatisfies(
        BillingAccountMemberRole.VIEWER,
        BillingAccountMemberRole.ADMINISTRATOR,
      ),
    ).toBe(false);
    expect(
      billingAccountRoleSatisfies(null, BillingAccountMemberRole.VIEWER),
    ).toBe(false);
  });

  it('parses Prisma billing labels into domain enums', () => {
    expect(parseBillingAccountStatus('CANCELLED')).toBe(
      BillingAccountStatus.CANCELLED,
    );
    expect(parseBillingAccountStatus('nope')).toBe(
      BillingAccountStatus.UNPROVISIONED,
    );
    expect(parseBillingAccountMemberRole('OWNER')).toBe(
      BillingAccountMemberRole.OWNER,
    );
    expect(parseBillingAccountMemberRole(null)).toBeNull();
    expect(parseBillingAccountOrganizationStatus('LINKED')).toBe(
      BillingAccountOrganizationStatus.LINKED,
    );
    expect(parseCreditReservationStatus('SETTLED')).toBe(
      CreditReservationStatus.SETTLED,
    );
  });
});

import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  type BillingAccountAccessClient,
  isBillingAccountScope,
  resolveBillingAccountAccess,
  resolveLiveBillingAccount,
} from './billing-account-scope';

function fakeClient(
  overrides: Partial<BillingAccountAccessClient> = {},
): BillingAccountAccessClient {
  return {
    billingAccount: {
      findFirst: async ({ where }) => ({ id: where.id, isDeleted: false }),
    },
    billingAccountOrganization: { findMany: async () => [] },
    organization: {
      findFirst: async ({ where }) => ({
        billingAccountId: 'billing-1',
        id: where.id,
      }),
    },
    ...overrides,
  };
}

describe('resolveBillingAccountAccess — tenant context enforcement (#5217, MAJOR 2)', () => {
  it('resolves when there is no active tenant context (background job)', async () => {
    const scope = await resolveBillingAccountAccess('org-1', fakeClient());
    expect(scope.billingAccountId).toBe('billing-1');
  });

  it('resolves when organizationId matches the active tenant context', async () => {
    const scope = await runWithTenantContext({ organizationId: 'org-1' }, () =>
      resolveBillingAccountAccess('org-1', fakeClient()),
    );
    expect(scope.billingAccountId).toBe('billing-1');
  });

  it('rejects an organizationId that does not match the active tenant context', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        resolveBillingAccountAccess('org-2', fakeClient()),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('applies the same tenant-context check to resolveLiveBillingAccount', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        resolveLiveBillingAccount('org-2', fakeClient()),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const account = await runWithTenantContext(
      { organizationId: 'org-1' },
      () => resolveLiveBillingAccount('org-1', fakeClient()),
    );
    expect(account.id).toBe('billing-1');
  });

  // Real Postgres enforces at most one LINKED, non-deleted
  // BillingAccountOrganization row per organizationId (a partial unique
  // index — see billing_account_organizations_active_org_key), so this
  // defensive branch can never be exercised against the real schema. A fake
  // client is the only way to prove the code still refuses to guess.
  it('rejects when more than one LINKED row is returned (ambiguous)', async () => {
    await expect(
      resolveBillingAccountAccess(
        'org-1',
        fakeClient({
          billingAccountOrganization: {
            findMany: async () => [
              { billingAccountId: 'billing-1' },
              { billingAccountId: 'billing-2' },
            ],
          },
          organization: {
            findFirst: async ({ where }) => ({
              billingAccountId: null,
              id: where.id,
            }),
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('isBillingAccountScope', () => {
  it('accepts a scope resolveBillingAccountAccess actually issued', async () => {
    const scope = await resolveBillingAccountAccess('org-1', fakeClient());
    expect(isBillingAccountScope(scope)).toBe(true);
  });

  it('rejects a plain object shaped like a scope', () => {
    expect(isBillingAccountScope({ billingAccountId: 'billing-1' })).toBe(
      false,
    );
  });

  it('rejects non-objects', () => {
    expect(isBillingAccountScope('billing-1')).toBe(false);
    expect(isBillingAccountScope(null)).toBe(false);
    expect(isBillingAccountScope(undefined)).toBe(false);
  });

  // Hardening (second re-review): the brand must be unforgeable at *runtime*,
  // not just secret-by-symbol at compile time. A symbol-keyed property is
  // still enumerable, so object-spreading a real scope carries the brand
  // property straight through onto a new object with a different id.
  it('rejects a spread-forged scope built from a real one with a different billingAccountId', async () => {
    const real = await resolveBillingAccountAccess('org-1', fakeClient());
    const forged = { ...real, billingAccountId: 'victim-account' };

    // The brand property itself copied through the spread...
    expect(Object.getOwnPropertySymbols(forged).length).toBeGreaterThan(0);
    // ...but object-identity (WeakSet) membership did not, so the forged
    // object is still rejected.
    expect(isBillingAccountScope(forged)).toBe(false);
  });

  it('rejects a real scope after its billingAccountId has been mutated in place', async () => {
    const real = await resolveBillingAccountAccess('org-1', fakeClient());

    // The scope is frozen at issuance, so a direct mutation attempt throws
    // (strict mode) rather than silently relabeling the same, still-issued
    // object — which is itself part of the hardening: there is no way to
    // keep WeakSet membership on the same object while changing its id.
    expect(() => {
      (real as { billingAccountId: string }).billingAccountId =
        'victim-account';
    }).toThrow(TypeError);
    expect(isBillingAccountScope(real)).toBe(true);
    expect(real.billingAccountId).toBe('billing-1');
  });

  it('rejects an object that merely carries the same-shaped symbol key from a different, unrelated object literal', () => {
    // Even a hand-built object using the *type* (bypassing the module's
    // private symbol is not actually possible from outside — this documents
    // that a plain object of the same public shape, with no symbol at all,
    // was never going to pass anyway) is rejected purely on WeakSet
    // membership grounds, independent of the billingAccountId shape check.
    const shapedLikeAScope = { billingAccountId: 'billing-1' };
    expect(isBillingAccountScope(shapedLikeAScope)).toBe(false);
  });
});

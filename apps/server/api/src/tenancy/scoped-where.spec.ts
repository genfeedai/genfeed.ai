import { IngredientStatus, type Prisma } from '@genfeedai/prisma';
import {
  type BillingAccountAccessClient,
  resolveBillingAccountAccess,
} from './billing-account-scope';
import {
  billingAccountScopedWhere,
  brandScope,
  scopedWhere,
} from './scoped-where';

describe('scopedWhere', () => {
  it('forces the tenant scope, overriding caller input', () => {
    expect(
      scopedWhere('org-1', {
        id: 'record-1',
        organizationId: 'other-org',
      }),
    ).toEqual({
      id: 'record-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('defaults to live rows when the caller omits isDeleted', () => {
    expect(scopedWhere('org-1', { id: 'record-1' })).toEqual({
      id: 'record-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('honors an explicit isDeleted instead of clobbering it', () => {
    expect(scopedWhere('org-1', { id: 'record-1', isDeleted: true })).toEqual({
      id: 'record-1',
      isDeleted: true,
      organizationId: 'org-1',
    });
  });

  it.each(['', null, undefined, false, 0])(
    'rejects a falsy organization id (%s)',
    (organizationId) => {
      expect(() =>
        scopedWhere(organizationId as unknown as string),
      ).toThrowError('scopedWhere: organizationId is required');
    },
  );
});

describe('scopedWhere typing', () => {
  it('satisfies a delegate where input when enum filters use enum members', () => {
    // The literal is typed on its own inside scopedWhere, with no contextual
    // type from Prisma, so an enum member is what keeps the array narrow.
    // Assigning to the delegate's input type is the assertion: string labels
    // widen to string[] and stop compiling here.
    const where: Prisma.IngredientWhereInput = scopedWhere('org-1', {
      parentId: null,
      status: { in: [IngredientStatus.GENERATED, IngredientStatus.FAILED] },
    });

    expect(where).toMatchObject({
      isDeleted: false,
      organizationId: 'org-1',
      parentId: null,
    });
  });

  it('keeps the tenant scope non-overridable on a typed where input', () => {
    const where: Prisma.PostWhereInput = scopedWhere('org-1', {
      organizationId: 'other-org',
    });

    expect(where.organizationId).toBe('org-1');
  });
});

function fakeBillingAccountClient(
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
  } as BillingAccountAccessClient;
}

describe('billingAccountScopedWhere', () => {
  it('builds the canonical billing-account scope for a resolved scope', async () => {
    const scope = await resolveBillingAccountAccess(
      'org-1',
      fakeBillingAccountClient(),
    );

    expect(
      billingAccountScopedWhere(scope, {
        billingAccountId: 'attacker-supplied',
        id: 'row-1',
      }),
    ).toEqual({
      billingAccountId: 'billing-1',
      id: 'row-1',
      isDeleted: false,
    });
  });

  it('defaults to live rows when the caller omits isDeleted', async () => {
    const scope = await resolveBillingAccountAccess(
      'org-1',
      fakeBillingAccountClient(),
    );

    expect(billingAccountScopedWhere(scope, { id: 'row-1' })).toEqual({
      billingAccountId: 'billing-1',
      id: 'row-1',
      isDeleted: false,
    });
  });

  it('honors an explicit isDeleted instead of clobbering it', async () => {
    const scope = await resolveBillingAccountAccess(
      'org-1',
      fakeBillingAccountClient(),
    );

    expect(
      billingAccountScopedWhere(scope, { id: 'row-1', isDeleted: true }),
    ).toEqual({
      billingAccountId: 'billing-1',
      id: 'row-1',
      isDeleted: true,
    });
  });

  it('keeps billingAccountId non-overridable, even under a spread ordering attack', async () => {
    const scope = await resolveBillingAccountAccess(
      'org-1',
      fakeBillingAccountClient(),
    );
    const where = billingAccountScopedWhere(scope, {
      billingAccountId: 'billing-attacker',
    });

    expect(where.billingAccountId).toBe('billing-1');
  });

  it('rejects a forged scope that lacks the runtime brand (#5217, MAJOR 2)', () => {
    const forged = {
      billingAccountId: 'billing-1',
    } as unknown as Parameters<typeof billingAccountScopedWhere>[0];

    expect(() => billingAccountScopedWhere(forged, {})).toThrowError(
      'billingAccountScopedWhere: scope must come from resolveBillingAccountAccess',
    );
  });
});

describe('brandScope', () => {
  it('returns a brand filter for a truthy brand id', () => {
    expect(brandScope('brand-1')).toEqual({ brandId: 'brand-1' });
  });

  it.each([null, undefined, ''])(
    'returns an empty filter for an absent brand id (%s)',
    (brandId) => {
      expect(brandScope(brandId)).toEqual({});
    },
  );
});

import { billingAccountScopedWhere, brandScope } from './scoped-where';

describe('billingAccountScopedWhere', () => {
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

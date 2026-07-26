import { brandScope, scopedWhere } from './scoped-where';

describe('scopedWhere', () => {
  it('forces the tenant and soft-delete scope after caller input', () => {
    expect(
      scopedWhere('org-1', {
        id: 'record-1',
        isDeleted: true,
        organizationId: 'other-org',
      }),
    ).toEqual({
      id: 'record-1',
      isDeleted: false,
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

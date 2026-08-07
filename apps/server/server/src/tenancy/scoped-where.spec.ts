import { brandScope, scopedWhere } from './scoped-where';

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

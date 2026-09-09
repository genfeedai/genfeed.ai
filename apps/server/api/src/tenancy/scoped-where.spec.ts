import { IngredientStatus, type Prisma } from '@genfeedai/prisma';
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

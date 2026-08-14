import {
  buildMeBrandsWhere,
  getCanonicalId,
  nestedSettingsRecord,
  readObjectRecord,
  shouldRestrictBrandsToMemberList,
} from './users-relationships.helpers';

describe('users relationship helpers', () => {
  it('reads object records and canonical ids', () => {
    expect(readObjectRecord(null)).toEqual({});
    expect(readObjectRecord('x')).toEqual({});
    expect(readObjectRecord({ id: 'abc' })).toEqual({ id: 'abc' });
    expect(getCanonicalId({ id: 'abc' })).toBe('abc');
    expect(getCanonicalId({ id: '' })).toBeUndefined();
    expect(getCanonicalId(null)).toBeUndefined();
  });

  it('restricts brand lists to member assignments for non-admins', () => {
    expect(shouldRestrictBrandsToMemberList(['b1'], false)).toBe(true);
    expect(shouldRestrictBrandsToMemberList(['b1'], true)).toBe(false);
    expect(shouldRestrictBrandsToMemberList([], false)).toBe(false);
    expect(shouldRestrictBrandsToMemberList(undefined, false)).toBe(false);
    expect(
      buildMeBrandsWhere({
        isDeleted: false,
        isSuperAdmin: false,
        memberBrandIds: ['brand-1'],
        organizationId: 'org-1',
      }),
    ).toEqual({
      id: { in: ['brand-1'] },
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(
      buildMeBrandsWhere({
        isDeleted: false,
        isSuperAdmin: true,
        memberBrandIds: ['brand-1'],
        organizationId: 'org-1',
      }),
    ).toEqual({
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('exposes nested settings when present', () => {
    expect(nestedSettingsRecord({ settings: { id: 's1' } })).toEqual({
      id: 's1',
    });
    expect(nestedSettingsRecord(null)).toBeUndefined();
  });
});

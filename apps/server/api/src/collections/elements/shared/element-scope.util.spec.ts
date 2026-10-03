import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  buildElementScopeConditions,
  canReadElement,
  isPlatformDefaultElement,
  orderElementsForOrganization,
  withPlatformDefaultFlag,
} from './element-scope.util';

function buildUser(organizationId: string, isSuperAdmin = false) {
  return {
    id: 'user-1',
    isSuperAdmin,
    organizationId,
    userId: 'user-1',
  } as AuthenticatedUser;
}

describe('element scope', () => {
  describe('buildElementScopeConditions', () => {
    it('gives members active platform defaults plus their own rows', () => {
      expect(buildElementScopeConditions({ organizationId: 'org-1' })).toEqual([
        { isActive: true, organizationId: null },
        { organizationId: 'org-1' },
      ]);
    });

    it('lets superadmins see inactive platform defaults too', () => {
      expect(
        buildElementScopeConditions({
          isSuperAdmin: true,
          organizationId: 'org-1',
        }),
      ).toEqual([{ organizationId: null }, { organizationId: 'org-1' }]);
    });

    it('still lists defaults, and never every organization, without an organization', () => {
      expect(buildElementScopeConditions({})).toEqual([
        { isActive: true, organizationId: null },
      ]);
    });
  });

  describe('canReadElement', () => {
    it('reads active defaults and own rows only', () => {
      const user = buildUser('org-1');

      expect(canReadElement(user, { isActive: true })).toBe(true);
      expect(canReadElement(user, { organizationId: 'org-1' })).toBe(true);
      expect(canReadElement(user, { organizationId: 'org-2' })).toBe(false);
    });

    it('hides inactive defaults from members but not superadmins', () => {
      expect(canReadElement(buildUser('org-1'), { isActive: false })).toBe(
        false,
      );
      expect(
        canReadElement(buildUser('org-1', true), { isActive: false }),
      ).toBe(true);
    });
  });

  it('marks platform defaults', () => {
    expect(isPlatformDefaultElement({ organizationId: null })).toBe(true);
    expect(withPlatformDefaultFlag({ organizationId: 'org-1' })).toMatchObject({
      isPlatformDefault: false,
    });
    expect(withPlatformDefaultFlag({})).toMatchObject({
      isPlatformDefault: true,
    });
  });

  it('orders defaults by curated order first, then newest own rows', () => {
    const ordered = orderElementsForOrganization([
      { createdAt: '2026-01-01', key: 'own-old', organizationId: 'org-1' },
      { key: 'second', organizationId: null, sortOrder: 20 },
      { createdAt: '2026-02-01', key: 'own-new', organizationId: 'org-1' },
      {
        createdAt: '2026-01-15',
        key: 'own-first',
        organizationId: 'org-1',
        sortOrder: -1,
      },
      { key: 'first', organizationId: null, sortOrder: 10 },
    ]);

    expect(ordered.map((item) => item.key)).toEqual([
      'first',
      'second',
      'own-first',
      'own-new',
      'own-old',
    ]);
  });
});

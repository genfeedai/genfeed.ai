import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { canModifyOrganizationElement } from './can-modify-organization-element.util';

function buildUser(
  organizationId: string,
  isSuperAdmin = false,
): AuthenticatedUser {
  return {
    brandId: 'brand-1',
    id: 'user-1',
    isSuperAdmin,
    organizationId,
    userId: 'user-1',
  };
}

describe('canModifyOrganizationElement', () => {
  it('allows a member to modify an element owned by their organization', () => {
    expect(
      canModifyOrganizationElement(buildUser('org-1'), {
        organizationId: 'org-1',
      }),
    ).toBe(true);
  });

  it('rejects cross-organization and global elements for members', () => {
    const user = buildUser('org-1');

    expect(
      canModifyOrganizationElement(user, { organizationId: 'org-2' }),
    ).toBe(false);
    expect(canModifyOrganizationElement(user, {})).toBe(false);
  });

  it('allows superadmins to modify global elements', () => {
    expect(canModifyOrganizationElement(buildUser('', true), {})).toBe(true);
  });
});

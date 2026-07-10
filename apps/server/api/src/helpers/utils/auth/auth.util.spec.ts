import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  getPublicMetadata,
  resolveRequiredBrandRequestContext,
} from '@api/helpers/utils/auth/auth.util';

describe('getPublicMetadata', () => {
  it('returns typed public metadata', () => {
    const user = {
      publicMetadata: {
        brand: '3',
        isSuperAdmin: false,
        organization: '2',
        user: '1',
      },
    } as unknown as User;
    const metadata = getPublicMetadata(user);
    expect(metadata.user).toBe('1');
    expect(metadata.organization).toBe('2');
    expect(metadata.brand).toBe('3');
    expect(metadata.isSuperAdmin).toBe(false);
  });
});

describe('resolveRequiredBrandRequestContext', () => {
  it('ignores scope overrides for non-admin users', () => {
    const user = {
      id: 'user-auth',
      publicMetadata: {
        brand: 'brand-1',
        isSuperAdmin: false,
        organization: 'org-1',
        user: 'user-1',
      },
    } as unknown as User;

    expect(
      resolveRequiredBrandRequestContext(user, {
        brand: 'brand-2',
        organization: 'org-2',
      }),
    ).toEqual({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('allows super-admin scope overrides', () => {
    const user = {
      id: 'user-auth',
      publicMetadata: {
        brand: 'brand-1',
        isSuperAdmin: true,
        organization: 'org-1',
        user: 'user-1',
      },
    } as unknown as User;

    expect(
      resolveRequiredBrandRequestContext(user, {
        brand: 'brand-2',
        organization: 'org-2',
      }),
    ).toEqual({
      brandId: 'brand-2',
      organizationId: 'org-2',
      userId: 'user-1',
    });
  });

  it('rejects incomplete scope', () => {
    expect(() =>
      resolveRequiredBrandRequestContext({ id: 'user-auth' } as User),
    ).toThrow('Organization, brand, and user context are required');
  });
});

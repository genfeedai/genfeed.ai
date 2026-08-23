import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  extractRequestContext,
  getIsSuperAdmin,
  getStripeSubscriptionStatus,
  getSubscriptionTier,
  resolveAuthorizedOrganizationId,
  resolveRequiredBrandRequestContext,
} from '@api/helpers/utils/auth/auth.util';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    brandId: '3',
    id: 'user-auth',
    isSuperAdmin: false,
    organizationId: '2',
    userId: '1',
    ...overrides,
  };
}

describe('extractRequestContext', () => {
  it('reads canonical identity fields from the user', () => {
    const ctx = extractRequestContext(makeUser());
    expect(ctx.userId).toBe('1');
    expect(ctx.organizationId).toBe('2');
    expect(ctx.brandId).toBe('3');
  });

  it('falls back to user.id when userId is missing', () => {
    const ctx = extractRequestContext(
      makeUser({ id: 'auth-id', userId: undefined as unknown as string }),
    );
    expect(ctx.userId).toBe('auth-id');
  });

  it('ignores leftover Clerk publicMetadata when canonical fields are set', () => {
    const ctx = extractRequestContext({
      ...makeUser(),
      publicMetadata: {
        brand: 'legacy-brand',
        organization: 'legacy-org',
        user: 'legacy-user',
      },
    } as User);

    expect(ctx.brandId).toBe('3');
    expect(ctx.organizationId).toBe('2');
    expect(ctx.userId).toBe('1');
  });

  it('ignores a foreign organizationId in the query for non-superadmin users', () => {
    const user = makeUser({ isSuperAdmin: false, organizationId: 'org-own' });

    const ctx = extractRequestContext(user, {
      organizationId: 'org-foreign',
    });

    expect(ctx.organizationId).toBe('org-own');
  });

  it('honors a query organizationId override for superadmin users', () => {
    const user = makeUser({ isSuperAdmin: true, organizationId: 'org-own' });

    const ctx = extractRequestContext(user, {
      organizationId: 'org-foreign',
    });

    expect(ctx.organizationId).toBe('org-foreign');
  });

  it('falls back to the user organization when the query omits organizationId', () => {
    const user = makeUser({ organizationId: 'org-own' });

    expect(extractRequestContext(user, {}).organizationId).toBe('org-own');
    expect(extractRequestContext(user).organizationId).toBe('org-own');
  });

  it('does not gate brandId/userId narrowing behind superadmin', () => {
    const user = makeUser({
      brandId: 'brand-own',
      isSuperAdmin: false,
      userId: 'user-own',
    });

    const ctx = extractRequestContext(user, {
      brandId: 'brand-other',
      userId: 'user-other',
    });

    expect(ctx.brandId).toBe('brand-other');
    expect(ctx.userId).toBe('user-other');
  });
});

describe('resolveAuthorizedOrganizationId', () => {
  it('returns the user organization when no query id is supplied', () => {
    const user = makeUser({ organizationId: 'org-own' });
    expect(resolveAuthorizedOrganizationId(user)).toBe('org-own');
    expect(resolveAuthorizedOrganizationId(user, undefined)).toBe('org-own');
    expect(resolveAuthorizedOrganizationId(user, '')).toBe('org-own');
  });

  it('ignores a foreign query id for non-superadmin users', () => {
    const user = makeUser({ isSuperAdmin: false, organizationId: 'org-own' });
    expect(resolveAuthorizedOrganizationId(user, 'org-foreign')).toBe(
      'org-own',
    );
  });

  it('honors a foreign query id for superadmin users', () => {
    const user = makeUser({ isSuperAdmin: true, organizationId: 'org-own' });
    expect(resolveAuthorizedOrganizationId(user, 'org-foreign')).toBe(
      'org-foreign',
    );
  });

  it('falls back to the user organization when superadmin supplies no query id', () => {
    const user = makeUser({ isSuperAdmin: true, organizationId: 'org-own' });
    expect(resolveAuthorizedOrganizationId(user, undefined)).toBe('org-own');
    expect(resolveAuthorizedOrganizationId(user, '')).toBe('org-own');
  });

  it('returns empty string when neither the user nor the query has an organization', () => {
    const user = makeUser({ organizationId: undefined as unknown as string });
    expect(resolveAuthorizedOrganizationId(user)).toBe('');
  });
});

describe('getIsSuperAdmin', () => {
  it('reads user.isSuperAdmin when request context is unset', () => {
    expect(getIsSuperAdmin(makeUser({ isSuperAdmin: true }))).toBe(true);
    expect(getIsSuperAdmin(makeUser({ isSuperAdmin: false }))).toBe(false);
  });

  it('prefers request.context.isSuperAdmin', () => {
    expect(
      getIsSuperAdmin(makeUser({ isSuperAdmin: false }), {
        context: { isSuperAdmin: true },
      } as never),
    ).toBe(true);
  });
});

describe('getStripeSubscriptionStatus', () => {
  it('reads the user field when request context is unset', () => {
    expect(
      getStripeSubscriptionStatus(
        makeUser({ stripeSubscriptionStatus: 'active' }),
      ),
    ).toBe('ACTIVE');
  });
});

describe('getSubscriptionTier', () => {
  it('reads the user field when request context is unset', () => {
    expect(getSubscriptionTier(makeUser({ subscriptionTier: 'pro' }))).toBe(
      'pro',
    );
  });
});

describe('resolveRequiredBrandRequestContext', () => {
  it('ignores scope overrides for non-admin users', () => {
    const user = makeUser({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(
      resolveRequiredBrandRequestContext(user, {
        brandId: 'brand-2',
        organizationId: 'org-2',
      }),
    ).toEqual({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('allows super-admin scope overrides', () => {
    const user = makeUser({
      brandId: 'brand-1',
      isSuperAdmin: true,
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(
      resolveRequiredBrandRequestContext(user, {
        brandId: 'brand-2',
        organizationId: 'org-2',
      }),
    ).toEqual({
      brandId: 'brand-2',
      organizationId: 'org-2',
      userId: 'user-1',
    });
  });

  it('rejects incomplete scope', () => {
    expect(() =>
      resolveRequiredBrandRequestContext({
        id: 'user-auth',
        isSuperAdmin: false,
        userId: 'user-auth',
      }),
    ).toThrow('Organization, brand, and user context are required');
  });
});

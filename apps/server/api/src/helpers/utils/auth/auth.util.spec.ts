import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  extractRequestContext,
  getIsSuperAdmin,
  getStripeSubscriptionStatus,
  getSubscriptionTier,
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

  it('ignores query scope overrides for members', () => {
    const ctx = extractRequestContext(makeUser(), {
      brandId: 'other-brand',
      organizationId: 'other-org',
      userId: 'other-user',
    });

    expect(ctx.brandId).toBe('3');
    expect(ctx.organizationId).toBe('2');
    expect(ctx.userId).toBe('1');
  });

  it('allows superadmin query scope overrides', () => {
    const ctx = extractRequestContext(makeUser({ isSuperAdmin: true }), {
      brandId: 'other-brand',
      organizationId: 'other-org',
      userId: 'other-user',
    });

    expect(ctx.brandId).toBe('other-brand');
    expect(ctx.organizationId).toBe('other-org');
    expect(ctx.userId).toBe('other-user');
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

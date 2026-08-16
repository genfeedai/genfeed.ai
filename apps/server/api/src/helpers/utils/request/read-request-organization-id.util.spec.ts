import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { describe, expect, it } from 'vitest';
import {
  isUsableOrganizationId,
  readRequestOrganizationId,
} from './read-request-organization-id.util';

function makeAuthenticatedUser(organizationId: string): AuthenticatedUser {
  return {
    brandId: 'brand_1',
    id: 'user_1',
    organizationId,
    userId: 'user_1',
  };
}

function makeRequestContext(organizationId: string): IRequestContext {
  return {
    hydratedAt: Date.now(),
    isSuperAdmin: false,
    organizationId,
    stripeSubscriptionStatus: 'active',
    subscriptionTier: 'pro',
    userId: 'user_1',
  };
}

describe('isUsableOrganizationId', () => {
  it('accepts cuid and legacy 24-hex ids', () => {
    expect(isUsableOrganizationId('cmptu23g70001zixnzwbzwp2e')).toBe(true);
    expect(isUsableOrganizationId('507f191e810c19729de860ee')).toBe(true);
  });

  it('rejects slugs and empty values', () => {
    expect(isUsableOrganizationId('default')).toBe(false);
    expect(isUsableOrganizationId('')).toBe(false);
    expect(isUsableOrganizationId(undefined)).toBe(false);
  });
});

describe('readRequestOrganizationId', () => {
  it('reads a usable organization id from request.context', () => {
    expect(
      readRequestOrganizationId({
        context: makeRequestContext('cmptu23g70001zixnzwbzwp2e'),
      }),
    ).toBe('cmptu23g70001zixnzwbzwp2e');
  });

  it('returns undefined when request.context and request.user are missing', () => {
    expect(readRequestOrganizationId({})).toBeUndefined();
  });

  it('rejects a URL slug in request.context', () => {
    expect(
      readRequestOrganizationId({
        context: makeRequestContext('default'),
      }),
    ).toBeUndefined();
  });

  it('falls back to the authenticated user when request.context is not hydrated', () => {
    // RequestContextMiddleware runs before the global auth guard sets
    // request.user, so Better Auth sessions reach guards with no context.
    expect(
      readRequestOrganizationId({
        user: makeAuthenticatedUser('cmptu23g70001zixnzwbzwp2e'),
      }),
    ).toBe('cmptu23g70001zixnzwbzwp2e');
  });

  it('prefers request.context over the authenticated user', () => {
    expect(
      readRequestOrganizationId({
        context: makeRequestContext('cmptu23g70001zixnzwbzwp2e'),
        user: makeAuthenticatedUser('507f191e810c19729de860ee'),
      }),
    ).toBe('cmptu23g70001zixnzwbzwp2e');
  });

  it('rejects an unusable organization id on the authenticated user', () => {
    expect(
      readRequestOrganizationId({
        user: makeAuthenticatedUser('default'),
      }),
    ).toBeUndefined();
  });
});

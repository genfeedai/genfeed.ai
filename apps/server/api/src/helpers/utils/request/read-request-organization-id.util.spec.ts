import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { describe, expect, it } from 'vitest';
import {
  isUsableOrganizationId,
  readRequestOrganizationId,
} from './read-request-organization-id.util';

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

  it('returns undefined when request.context is missing', () => {
    expect(readRequestOrganizationId({})).toBeUndefined();
  });

  it('rejects a URL slug in request.context', () => {
    expect(
      readRequestOrganizationId({
        context: makeRequestContext('default'),
      }),
    ).toBeUndefined();
  });
});

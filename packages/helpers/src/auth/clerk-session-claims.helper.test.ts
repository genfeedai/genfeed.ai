import {
  buildClerkHotPathUser,
  buildClerkPublicMetadataFromClaims,
  hasClerkHotPathClaims,
  resolveClerkSessionClaims,
} from '@helpers/auth/clerk-session-claims.helper';
import { describe, expect, it } from 'vitest';

describe('clerk-session-claims.helper', () => {
  describe('resolveClerkSessionClaims', () => {
    it('prefers explicit hot-path claims from verified session payloads', () => {
      const claims = resolveClerkSessionClaims({
        email: 'owner@example.com',
        given_name: 'Ada',
        metadata: {
          publicMetadata: {
            brand: 'brand_123',
            isSuperAdmin: true,
            organization: 'org_123',
            user: '507f1f77bcf86cd799439011',
          },
        },
        sub: 'user_clerk_123',
      });

      expect(claims).toEqual({
        brandId: 'brand_123',
        clerkUserId: 'user_clerk_123',
        email: 'owner@example.com',
        firstName: 'Ada',
        isSuperAdmin: true,
        mongoUserId: '507f1f77bcf86cd799439011',
        organizationId: 'org_123',
      });
    });

    it('supports custom top-level claim keys on the standard session token', () => {
      const claims = resolveClerkSessionClaims({
        brandId: 'brand_987',
        email_address: 'ops@example.com',
        family_name: 'Lovelace',
        mongoUserId: '507f191e810c19729de860ea',
        org_id: 'org_987',
        sub: 'user_clerk_987',
      });

      expect(claims).toEqual({
        brandId: 'brand_987',
        clerkUserId: 'user_clerk_987',
        email: 'ops@example.com',
        lastName: 'Lovelace',
        mongoUserId: '507f191e810c19729de860ea',
        organizationId: 'org_987',
      });
    });
  });

  describe('hasClerkHotPathClaims', () => {
    it('requires clerk, mongo, and organization ids for the fast path', () => {
      expect(
        hasClerkHotPathClaims({
          clerkUserId: 'user_clerk_1',
          mongoUserId: '507f1f77bcf86cd799439011',
          organizationId: 'org_1',
        }),
      ).toBe(true);

      expect(
        hasClerkHotPathClaims({
          clerkUserId: 'user_clerk_1',
          organizationId: 'org_1',
        }),
      ).toBe(false);
    });

    it('can require a brand claim when the caller needs it', () => {
      expect(
        hasClerkHotPathClaims(
          {
            clerkUserId: 'user_clerk_1',
            mongoUserId: '507f1f77bcf86cd799439011',
            organizationId: 'org_1',
          },
          { requireBrand: true },
        ),
      ).toBe(false);
    });
  });

  describe('buildClerkHotPathUser', () => {
    it('builds a Clerk-like user shape without an upstream user fetch', () => {
      const user = buildClerkHotPathUser({
        brandId: 'brand_123',
        clerkUserId: 'user_clerk_123',
        email: 'owner@example.com',
        firstName: 'Ada',
        isSuperAdmin: true,
        mongoUserId: '507f1f77bcf86cd799439011',
        organizationId: 'org_123',
      });

      expect(user).toEqual({
        email: 'owner@example.com',
        emailAddresses: [{ emailAddress: 'owner@example.com' }],
        firstName: 'Ada',
        id: 'user_clerk_123',
        publicMetadata: {
          brand: 'brand_123',
          clerkId: 'user_clerk_123',
          isSuperAdmin: true,
          organization: 'org_123',
          user: '507f1f77bcf86cd799439011',
        },
      });
    });

    it('builds public metadata without undefined placeholders', () => {
      expect(
        buildClerkPublicMetadataFromClaims({
          clerkUserId: 'user_clerk_123',
          mongoUserId: '507f1f77bcf86cd799439011',
          organizationId: 'org_123',
        }),
      ).toEqual({
        clerkId: 'user_clerk_123',
        organization: 'org_123',
        user: '507f1f77bcf86cd799439011',
      });
    });
  });
});

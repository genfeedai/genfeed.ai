import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ForbiddenException } from '@nestjs/common';

import {
  ANALYTICS_MISSING_ORGANIZATION_MESSAGE,
  ANALYTICS_TENANT_FORBIDDEN,
  assertAnalyticsBrandInScope,
  buildAnalyticsCacheKey,
  buildOwnedAnalyticsCacheKey,
  resolveAnalyticsTenantScope,
  resolveOwnedAnalyticsTenantScope,
} from './analytics-tenant-scope';

describe('analytics tenant scope', () => {
  const member: AuthenticatedUser = {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };

  describe('resolveAnalyticsTenantScope', () => {
    it('rejects a customer naming another organization', () => {
      expect(() =>
        resolveAnalyticsTenantScope(member, {
          query: { organizationId: 'org-2' },
        } as unknown as Parameters<typeof resolveAnalyticsTenantScope>[1]),
      ).toThrow(new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN));
    });
  });

  describe('buildAnalyticsCacheKey', () => {
    it('keeps two organizations from sharing a customer cache entry', () => {
      const parts = ['2025-01-01', '2025-01-31', ''] as const;
      const orgA = buildAnalyticsCacheKey(
        'overview',
        { user: { organizationId: 'org-a' } },
        parts,
      );
      const orgB = buildAnalyticsCacheKey(
        'overview',
        { user: { organizationId: 'org-b' } },
        parts,
      );

      expect(orgA).toBe(
        'analytics:overview:customer:org-a:2025-01-01:2025-01-31:',
      );
      expect(orgB).toBe(
        'analytics:overview:customer:org-b:2025-01-01:2025-01-31:',
      );
      expect(orgA).not.toBe(orgB);
    });

    it('isolates superadmin cache entries from customer keys', () => {
      const parts = ['2025-01-01', '2025-01-31', 'brand-1'] as const;
      const customerKey = buildAnalyticsCacheKey(
        'growth',
        { user: { organizationId: 'org-1' } },
        parts,
      );
      const superadminKey = buildAnalyticsCacheKey(
        'growth',
        {
          user: { isSuperAdmin: true, organizationId: 'org-1' },
        },
        parts,
      );

      expect(customerKey).toBe(
        'analytics:growth:customer:org-1:2025-01-01:2025-01-31:brand-1',
      );
      expect(superadminKey).toBe(
        'analytics:growth:superadmin:all:2025-01-01:2025-01-31:brand-1',
      );
    });

    it('keys a narrowed superadmin read by the requested organization', () => {
      expect(
        buildAnalyticsCacheKey(
          'brands',
          {
            query: { organizationId: 'org-2' },
            user: { isSuperAdmin: true, organizationId: 'org-1' },
          },
          ['default', 'default'],
        ),
      ).toBe('analytics:brands:superadmin:org-2:default:default');
    });

    it('honors request-context superadmin over the user flag', () => {
      expect(
        buildAnalyticsCacheKey(
          'overview',
          {
            context: { isSuperAdmin: true },
            user: { isSuperAdmin: false, organizationId: 'org-1' },
          },
          ['default', 'default', ''],
        ),
      ).toBe('analytics:overview:superadmin:all:default:default:');
    });
  });

  describe('resolveOwnedAnalyticsTenantScope', () => {
    it('rejects a caller without an organization before any read', () => {
      expect(() =>
        resolveOwnedAnalyticsTenantScope({
          id: 'user-3',
          isSuperAdmin: true,
          userId: 'user-3',
        } as AuthenticatedUser),
      ).toThrow(new ForbiddenException(ANALYTICS_MISSING_ORGANIZATION_MESSAGE));
    });
  });

  describe('buildOwnedAnalyticsCacheKey', () => {
    it('keys by the caller organization so two superadmins never share an entry', () => {
      const parts = ['2025-01-01', '2025-01-31', 'brand-1'] as const;

      expect(
        buildOwnedAnalyticsCacheKey(
          'top',
          { user: { isSuperAdmin: true, organizationId: 'org-a' } },
          parts,
        ),
      ).toBe('analytics:top:owned:org-a:2025-01-01:2025-01-31:brand-1');
      expect(
        buildOwnedAnalyticsCacheKey(
          'top',
          { user: { isSuperAdmin: true, organizationId: 'org-b' } },
          parts,
        ),
      ).toBe('analytics:top:owned:org-b:2025-01-01:2025-01-31:brand-1');
    });
  });

  describe('assertAnalyticsBrandInScope', () => {
    it('skips the lookup when no brand filter is present', async () => {
      const findBrand = vi.fn();

      await assertAnalyticsBrandInScope(findBrand, undefined, 'org-1');

      expect(findBrand).not.toHaveBeenCalled();
    });

    it('requires a superadmin brand filter to match an existing brand', async () => {
      const findBrand = vi.fn().mockResolvedValue(null);

      await expect(
        assertAnalyticsBrandInScope(findBrand, 'missing-brand', undefined),
      ).rejects.toEqual(new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN));
      expect(findBrand).toHaveBeenCalledWith({
        id: 'missing-brand',
        isDeleted: false,
      });
    });
  });
});

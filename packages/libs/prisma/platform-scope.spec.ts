import { describe, expect, it } from 'vitest';
import {
  platformOrTenantScope,
  platformTenantProof,
  withPlatformTenantArm,
} from './platform-scope';
import { crossOrgUnsafe, runWithTenantContext } from './tenant-context';
import { assertTenantScopedQuery } from './tenant-guard';

const TENANT = 'org-1';

function guard(args: unknown): void {
  assertTenantScopedQuery({
    args,
    isCloud: true,
    model: 'Model',
    operation: 'findMany',
    tenantModelNames: new Set(['Model']),
  });
}

describe('platformOrTenantScope', () => {
  it('is the plain platform filter without a tenant context', () => {
    expect(platformOrTenantScope()).toEqual({ organizationId: null });
  });

  it('names the platform and the active tenant', () => {
    runWithTenantContext({ organizationId: TENANT }, () => {
      const scope = platformOrTenantScope();

      expect(scope).toEqual({
        OR: [{ organizationId: TENANT }, { organizationId: null }],
      });
      expect(() =>
        guard({ where: { isDeleted: false, ...scope } }),
      ).not.toThrow();
    });
  });

  it('prefers an explicit organization', () => {
    expect(platformOrTenantScope('org-2')).toEqual({
      OR: [{ organizationId: 'org-2' }, { organizationId: null }],
    });
  });

  it('proves nothing for a bare platform read, which the guard rejects', () => {
    runWithTenantContext({ organizationId: TENANT }, () => {
      expect(() =>
        guard({ where: { isDeleted: false, organizationId: null } }),
      ).toThrow('missing-organization-id');
    });
  });
});

describe('platformTenantProof', () => {
  it('is empty without a tenant context', () => {
    expect(platformTenantProof()).toEqual([]);
  });

  it('lets a platform-only read pass the guard without widening it', () => {
    runWithTenantContext({ organizationId: TENANT }, () => {
      const where = {
        AND: platformTenantProof(),
        isDeleted: false,
        organizationId: null,
      };

      expect(() => guard({ where })).not.toThrow();
      expect(where.organizationId).toBeNull();
    });
  });
});

describe('withPlatformTenantArm', () => {
  it('leaves the where alone without a tenant context', () => {
    const where = { isDeleted: false };

    expect(withPlatformTenantArm(where)).toBe(where);
  });

  it('adds the arm to a where that names no organization', () => {
    runWithTenantContext({ organizationId: TENANT }, () => {
      const where = withPlatformTenantArm({ isDeleted: false });

      expect(where.AND).toEqual([
        { OR: [{ organizationId: TENANT }, { organizationId: null }] },
      ]);
      expect(() => guard({ where })).not.toThrow();
    });
  });

  it('keeps an existing AND object or array and appends to it', () => {
    runWithTenantContext({ organizationId: TENANT }, () => {
      const existing = { key: 'a' };

      expect(withPlatformTenantArm({ AND: existing }).AND).toHaveLength(2);
      expect(
        withPlatformTenantArm({ AND: [existing, existing] }).AND,
      ).toHaveLength(3);
    });
  });

  it('adds the arm next to a platform-only filter', () => {
    runWithTenantContext({ organizationId: TENANT }, () => {
      const where = withPlatformTenantArm({ organizationId: null });

      expect(where.organizationId).toBeNull();
      expect(() => guard({ where })).not.toThrow();
    });
  });

  it('leaves a where that already names an organization', () => {
    runWithTenantContext({ organizationId: TENANT }, () => {
      const where = { organizationId: TENANT };

      expect(withPlatformTenantArm(where)).toBe(where);
    });
  });

  it('leaves the where alone inside crossOrgUnsafe', () => {
    runWithTenantContext({ organizationId: TENANT }, () => {
      const where = { isDeleted: false };

      expect(crossOrgUnsafe(() => withPlatformTenantArm(where))).toBe(where);
    });
  });
});

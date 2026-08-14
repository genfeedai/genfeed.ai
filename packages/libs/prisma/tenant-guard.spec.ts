import { describe, expect, it } from 'vitest';
import { crossOrgUnsafe, runWithTenantContext } from './tenant-context';
import {
  assertTenantScopedQuery,
  type TenantGuardArgs,
  TenantIsolationError,
} from './tenant-guard';
import { createTenantGuardExtension } from './tenant-guard.extension';

const TENANT_MODEL_NAMES = new Set(['Post']);
const CLOUD_TENANT: Omit<TenantGuardArgs, 'args' | 'operation'> = {
  isCloud: true,
  model: 'Post',
  tenantModelNames: TENANT_MODEL_NAMES,
};

function guard(overrides: Partial<TenantGuardArgs> = {}): void {
  assertTenantScopedQuery({
    args: { where: { id: 'post-1' } },
    operation: 'findMany',
    ...CLOUD_TENANT,
    ...overrides,
  });
}

describe('assertTenantScopedQuery', () => {
  it('throws in CLOUD when a tenant-model query lacks organizationId and tenant context is set', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () => guard()),
    ).toThrow(TenantIsolationError);

    try {
      runWithTenantContext({ organizationId: 'org-1' }, () => guard());
    } catch (error) {
      expect(error).toMatchObject({
        model: 'Post',
        name: 'TenantIsolationError',
        operation: 'findMany',
        reason: 'missing-organization-id',
      });
      return;
    }

    throw new Error('Expected TenantIsolationError');
  });

  it('passes in LOCAL even with tenant context and an unscoped tenant query', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({ isCloud: false }),
      ),
    ).not.toThrow();
  });

  it('passes for a non-tenant model in CLOUD without organizationId', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({ model: 'Organization' }),
      ),
    ).not.toThrow();
  });

  it('passes through the crossOrgUnsafe escape hatch', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        crossOrgUnsafe(() => guard()),
      ),
    ).not.toThrow();
  });

  it('does not throw in CLOUD without tenant context so workers can pass organizationId or hatch later', () => {
    expect(() => guard()).not.toThrow();
  });

  it('allows a tenant query whose organizationId matches request context', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: { where: { id: 'post-1', organizationId: 'org-1' } },
        }),
      ),
    ).not.toThrow();
  });

  it('throws when the query organizationId does not match request context', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: { where: { organizationId: 'org-2' } },
        }),
      ),
    ).toThrow(TenantIsolationError);

    try {
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: { where: { organizationId: { equals: 'org-2' } } },
        }),
      );
    } catch (error) {
      expect(error).toMatchObject({
        reason: 'organization-id-mismatch',
      });
      return;
    }

    throw new Error('Expected TenantIsolationError');
  });

  it('treats upsert where/create organizationId as present', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: {
            create: { organizationId: 'org-1', title: 'Hello' },
            update: { title: 'Hello' },
            where: { id: 'post-1' },
          },
          operation: 'upsert',
        }),
      ),
    ).not.toThrow();
  });

  it('does not guard create because the compile-time ratchet does not either', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        guard({
          args: { data: { title: 'Hello' } },
          operation: 'create',
        }),
      ),
    ).not.toThrow();
  });
});

describe('createTenantGuardExtension', () => {
  it('intercepts $allOperations and forwards args when the query is allowed', async () => {
    const extension = createTenantGuardExtension({
      isCloud: true,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    const query = async (args: unknown) => args;
    const args = { where: { organizationId: 'org-1' } };

    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        extension.query.$allModels.$allOperations({
          args,
          model: 'Post',
          operation: 'findMany',
          query,
        }),
      ),
    ).resolves.toEqual(args);
  });

  it('rejects an unscoped tenant query in CLOUD before calling query', async () => {
    const extension = createTenantGuardExtension({
      isCloud: true,
      tenantModelNames: TENANT_MODEL_NAMES,
    });
    let queryCalled = false;

    await expect(
      runWithTenantContext({ organizationId: 'org-1' }, () =>
        extension.query.$allModels.$allOperations({
          args: { where: { id: 'post-1' } },
          model: 'Post',
          operation: 'update',
          query: async (args) => {
            queryCalled = true;
            return args;
          },
        }),
      ),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    expect(queryCalled).toBe(false);
  });
});

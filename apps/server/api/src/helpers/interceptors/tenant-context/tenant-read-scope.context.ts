import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  ITenantReadScope,
  TenantReadIdentity,
} from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';

const storage = new AsyncLocalStorage<ITenantReadScope>();

export function runWithTenantReadScope<T>(
  scope: ITenantReadScope,
  work: () => T,
): T {
  return storage.run(
    Object.freeze({
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      isOrganizationOverride: scope.isOrganizationOverride,
    }),
    work,
  );
}

export function getTenantReadScope(): ITenantReadScope | undefined {
  return storage.getStore();
}

export function resolveTenantReadScope(
  identity: TenantReadIdentity,
): ITenantReadScope {
  return (
    getTenantReadScope() ??
    Object.freeze({
      organizationId: identity.organizationId,
      brandId: identity.brandId,
      isOrganizationOverride: false,
    })
  );
}

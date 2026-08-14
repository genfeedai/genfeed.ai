import { AsyncLocalStorage } from 'node:async_hooks';

export type PrismaTenantContext = {
  organizationId: string;
};

type TenantStore = {
  isCrossOrgUnsafe: boolean;
  organizationId?: string;
};

const storage = new AsyncLocalStorage<TenantStore>();

function sanitizeOrganizationId(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const organizationId = value.trim();
  return organizationId.length > 0 ? organizationId : undefined;
}

function currentStore(): TenantStore {
  return (
    storage.getStore() ?? {
      isCrossOrgUnsafe: false,
    }
  );
}

export function getTenantContext(): PrismaTenantContext | undefined {
  const organizationId = sanitizeOrganizationId(currentStore().organizationId);
  return organizationId ? { organizationId } : undefined;
}

export function isCrossOrgUnsafe(): boolean {
  return currentStore().isCrossOrgUnsafe === true;
}

export function runWithTenantContext<T>(
  context: PrismaTenantContext,
  callback: () => T,
): T {
  const organizationId = sanitizeOrganizationId(context.organizationId);
  if (!organizationId) {
    throw new Error('runWithTenantContext: organizationId is required');
  }

  const parent = currentStore();
  return storage.run(
    {
      isCrossOrgUnsafe: parent.isCrossOrgUnsafe,
      organizationId,
    },
    callback,
  );
}

/**
 * Named, greppable escape hatch for legitimate cross-org Prisma queries in
 * CLOUD mode (platform admin, system workflows). Do not add a silent boolean.
 */
export function crossOrgUnsafe<T>(callback: () => T): T {
  const parent = currentStore();
  return storage.run(
    {
      isCrossOrgUnsafe: true,
      organizationId: parent.organizationId,
    },
    callback,
  );
}

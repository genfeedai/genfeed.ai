import { createLocalStorageCache } from '@helpers/data/cache/cache.helper';

let currentScope: string | null = null;

/**
 * Who and what the device's saved copies are for right now: the signed-in user
 * and the organization the server confirmed for the page. Null until both are
 * known, and while it is null no saved copy is read or written.
 */
export function setDeviceStoreScope(
  scope: { organizationId: string; userId: string } | null,
): void {
  currentScope = scope ? `${scope.userId}:${scope.organizationId}` : null;
}

function getDeviceStoreScope(): string | null {
  return currentScope;
}

/**
 * A saved copy of a read that is kept on the device. Its keys carry the user
 * and organization, so a copy is never returned to another user or under
 * another organization. `prefix` must be listed in `device-stores.ts`.
 */
export function createWorkspaceLocalStorageCache<T>(prefix: string) {
  return createLocalStorageCache<T>({ prefix, scope: getDeviceStoreScope });
}

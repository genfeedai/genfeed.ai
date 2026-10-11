import { AsyncLocalStorage } from 'node:async_hooks';
import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';

const storage = new AsyncLocalStorage<BrandAccessActor | undefined>();

/**
 * Runs `work` as the authenticated principal of the current HTTP request. Bound once by the
 * request interceptor from the guard-authenticated user or API key; never from input. Work
 * that starts outside a request (workers, queues, system workflows) has no principal.
 */
export function runWithRequestPrincipal<T>(
  principal: BrandAccessActor | undefined,
  work: () => T,
): T {
  return storage.run(
    principal ? Object.freeze({ ...principal }) : undefined,
    work,
  );
}

/** The principal that is making the current request, or undefined outside one. */
export function getRequestPrincipal(): BrandAccessActor | undefined {
  return storage.getStore();
}

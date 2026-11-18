import type { MediaDeliveryScope } from '@genfeedai/contracts/interfaces';

const requestScopes = new WeakMap<object, MediaDeliveryScope>();

/**
 * A route that has already proved the caller's access to a thread registers the
 * thread's media scope here, so the response projection signs the thread's own
 * media for that member instead of applying the per-record owner rule alone.
 */
export function setRequestMediaScope(
  request: object,
  scope: MediaDeliveryScope,
): void {
  requestScopes.set(request, scope);
}

export function getRequestMediaScope(
  request: object,
): MediaDeliveryScope | undefined {
  return requestScopes.get(request);
}

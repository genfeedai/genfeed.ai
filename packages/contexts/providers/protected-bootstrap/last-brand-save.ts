import { clearClientProtectedBootstrapCache } from './client-protected-bootstrap';

const REUSE_AFTER_SETTLED_MS = 10_000;

let lastRequestedBrandId = '';
let lastRequest: Promise<void> | null = null;
let lastSettledAt: number | null = null;

function canReuseLastRequest(brandId: string): boolean {
  if (!lastRequest || lastRequestedBrandId !== brandId) {
    return false;
  }

  return (
    lastSettledAt === null ||
    Date.now() - lastSettledAt < REUSE_AFTER_SETTLED_MS
  );
}

/**
 * Saves the member's last-used brand. A brand switch is observed twice, once by
 * the switcher that was clicked and once by the provider that follows the URL,
 * so the request is shared: asking again for the brand already being saved, or
 * saved a moment ago, reuses that request instead of sending a second one. A
 * failed save is forgotten so the next attempt retries.
 */
export function saveLastBrand(
  brandId: string,
  save: (brandId: string) => Promise<unknown>,
): Promise<void> {
  if (lastRequest && canReuseLastRequest(brandId)) {
    return lastRequest;
  }

  const request = save(brandId).then(() => {
    clearClientProtectedBootstrapCache();
  });

  lastRequestedBrandId = brandId;
  lastRequest = request;
  lastSettledAt = null;

  request.then(
    () => {
      if (lastRequest === request) {
        lastSettledAt = Date.now();
      }
    },
    () => {
      if (lastRequest === request) {
        resetLastBrandSave();
      }
    },
  );

  return request;
}

export function resetLastBrandSave(): void {
  lastRequestedBrandId = '';
  lastRequest = null;
  lastSettledAt = null;
}

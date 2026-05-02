'use client';

import type { ProtectedBootstrapData } from '@genfeedai/props/layout/protected-bootstrap.props';
import type {
  AuthService,
  ProtectedAppBootstrapPayload,
} from '@genfeedai/services/auth/auth.service';

interface ClientProtectedBootstrapCacheEntry {
  data?: ProtectedBootstrapData | null;
  promise?: Promise<ProtectedBootstrapData | null>;
  updatedAt: number;
}

const CLIENT_PROTECTED_BOOTSTRAP_TTL_MS = 60_000;

const clientProtectedBootstrapCache = new Map<
  string,
  ClientProtectedBootstrapCacheEntry
>();

export function mapProtectedBootstrapPayload(
  payload: ProtectedAppBootstrapPayload,
): ProtectedBootstrapData {
  return {
    accessState: payload.access,
    brandId: payload.access.brandId ?? '',
    brands: payload.brands ?? [],
    currentUser: payload.currentUser,
    darkroomCapabilities: payload.darkroomCapabilities,
    organizationId: payload.access.organizationId ?? '',
    settings: payload.settings,
    streak: payload.streak,
  };
}

export async function loadClientProtectedBootstrap(
  cacheKey: string | undefined,
  getAuthService: () => Promise<AuthService>,
): Promise<ProtectedBootstrapData | null> {
  if (!cacheKey) {
    const service = await getAuthService();
    return mapProtectedBootstrapPayload(await service.getBootstrap());
  }

  const now = Date.now();
  const cacheEntry = clientProtectedBootstrapCache.get(cacheKey);

  if (
    cacheEntry?.data !== undefined &&
    now - cacheEntry.updatedAt <= CLIENT_PROTECTED_BOOTSTRAP_TTL_MS
  ) {
    return cacheEntry.data;
  }

  if (cacheEntry?.promise) {
    return cacheEntry.promise;
  }

  const promise = getAuthService()
    .then((service) => service.getBootstrap())
    .then(mapProtectedBootstrapPayload);

  clientProtectedBootstrapCache.set(cacheKey, {
    promise,
    updatedAt: now,
  });

  try {
    const data = await promise;
    clientProtectedBootstrapCache.set(cacheKey, {
      data,
      updatedAt: Date.now(),
    });
    return data;
  } catch (error) {
    clientProtectedBootstrapCache.delete(cacheKey);
    throw error;
  }
}

export function clearClientProtectedBootstrapCache(): void {
  clientProtectedBootstrapCache.clear();
}

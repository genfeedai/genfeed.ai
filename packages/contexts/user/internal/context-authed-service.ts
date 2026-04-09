'use client';

import { useAuth } from '@clerk/nextjs';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useCallback, useEffect, useRef } from 'react';

const tokenCache = new Map<
  string,
  { expiresAt: number; promise: Promise<string> }
>();

const TOKEN_CACHE_TTL_MS = 30_000;
const TOKEN_EXPIRY_SKEW_MS = 5_000;
const DEFAULT_TOKEN_CACHE_KEY = '__default__';
const IDENTITY_CACHE_KEY_SEPARATOR = '\u0001';

interface TokenOptions {
  forceRefresh?: boolean;
  template?: string;
}

export class ContextAuthenticationTokenUnavailableError extends Error {
  constructor() {
    super('Authentication token unavailable');
    this.name = 'ContextAuthenticationTokenUnavailableError';
  }
}

function getJwtAwareExpiry(token: string): number {
  const fallbackExpiry = Date.now() + TOKEN_CACHE_TTL_MS;
  const payload = token.split('.')[1];

  if (!payload) {
    return fallbackExpiry;
  }

  try {
    const normalizedPayload = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');

    const decodedPayload = atob(normalizedPayload);
    const parsed = JSON.parse(decodedPayload) as { exp?: number };

    if (typeof parsed.exp !== 'number') {
      return fallbackExpiry;
    }

    return Math.min(
      fallbackExpiry,
      Math.max(Date.now(), parsed.exp * 1000 - TOKEN_EXPIRY_SKEW_MS),
    );
  } catch {
    return fallbackExpiry;
  }
}

function getCachedToken(
  getTokenFn: (opts?: TokenOptions) => Promise<string | null>,
  identityKey: string,
  options?: TokenOptions,
): Promise<string> {
  const cacheKey = [
    identityKey,
    options?.template ?? DEFAULT_TOKEN_CACHE_KEY,
  ].join(IDENTITY_CACHE_KEY_SEPARATOR);
  const tokenOptions =
    options?.template || options?.forceRefresh ? options : undefined;
  const cached = !options?.forceRefresh ? tokenCache.get(cacheKey) : undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = resolveClerkToken(getTokenFn, tokenOptions).then((token) => {
    if (!token) {
      tokenCache.delete(cacheKey);
      throw new ContextAuthenticationTokenUnavailableError();
    }

    const cachedEntry = tokenCache.get(cacheKey);
    if (cachedEntry?.promise === promise) {
      cachedEntry.expiresAt = getJwtAwareExpiry(token);
    }

    return token;
  });

  tokenCache.set(cacheKey, {
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
    promise,
  });

  promise.catch(() => {
    tokenCache.delete(cacheKey);
  });

  return promise;
}

export function clearContextTokenCache(): void {
  tokenCache.clear();
}

export function useContextAuthedService<T>(
  factory: (token: string) => T,
  template?: string,
) {
  const { getToken, orgId, userId } = useAuth();
  const factoryRef = useRef(factory);
  const getTokenRef = useRef(
    getToken as (opts?: TokenOptions) => Promise<string | null>,
  );

  useEffect(() => {
    factoryRef.current = factory;
    getTokenRef.current = getToken as (
      opts?: TokenOptions,
    ) => Promise<string | null>;
  }, [factory, getToken]);

  const identityKey = `${userId ?? 'anonymous'}:${orgId ?? 'no-org'}`;

  return useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      const token = await getCachedToken(getTokenRef.current, identityKey, {
        forceRefresh: options?.forceRefresh,
        template,
      });

      return factoryRef.current(token);
    },
    [identityKey, template],
  );
}

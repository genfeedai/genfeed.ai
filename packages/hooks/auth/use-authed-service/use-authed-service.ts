'use client';

import { resolveRequiredAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useCallback, useEffect, useRef } from 'react';

const IDENTITY_CACHE_KEY_SEPARATOR = '\u0001';

interface TokenOptions {
  forceRefresh?: boolean;
  template?: string;
}

export class AuthenticationTokenUnavailableError extends Error {
  constructor() {
    super('Authentication token unavailable');
    this.name = 'AuthenticationTokenUnavailableError';
  }
}

export function useAuthedService<T>(
  factory: (token: string) => T,
  template?: string,
) {
  const { getToken, orgId, sessionId, userId } = useAuthIdentity();

  // Store factory in ref to avoid callback recreation
  const factoryRef = useRef(factory);

  // Store getToken in ref to avoid callback recreation
  const getTokenRef = useRef(
    getToken as (opts?: TokenOptions) => Promise<string | null>,
  );

  // Update refs when they change
  useEffect(() => {
    factoryRef.current = factory;
    getTokenRef.current = getToken as (
      opts?: TokenOptions,
    ) => Promise<string | null>;
  }, [factory, getToken]);

  const identityKey = [
    sessionId ?? 'no-session',
    userId ?? 'anonymous',
    orgId ?? 'no-org',
  ].join(IDENTITY_CACHE_KEY_SEPARATOR);

  // biome-ignore lint/correctness/useExhaustiveDependencies: identityKey intentionally refreshes consumers after auth scope changes
  return useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      const tokenOptions =
        template || options?.forceRefresh
          ? { forceRefresh: options?.forceRefresh, template }
          : undefined;
      const token = await resolveRequiredAuthToken(
        getTokenRef.current,
        tokenOptions,
        () => new AuthenticationTokenUnavailableError(),
      );
      return factoryRef.current(token);
    },
    [identityKey, template],
  );
}

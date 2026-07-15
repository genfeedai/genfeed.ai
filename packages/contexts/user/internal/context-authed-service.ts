'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveRequiredAuthToken } from '@helpers/auth/auth.helper';
import { useCallback, useEffect, useRef } from 'react';

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

export function useContextAuthedService<T>(
  factory: (token: string) => T,
  template?: string,
) {
  const { getToken, orgId, sessionId, userId } = useAuthIdentity();
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
        () => new ContextAuthenticationTokenUnavailableError(),
      );

      return factoryRef.current(token);
    },
    [identityKey, template],
  );
}

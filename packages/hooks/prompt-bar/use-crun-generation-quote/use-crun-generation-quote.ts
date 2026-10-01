'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isDesktopClient } from '@genfeedai/config/deployment';
import type {
  IDesktopBootstrap,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import type { CrunGenerationQuoteResponse } from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import type {
  UseCrunGenerationQuoteOptions,
  UseCrunGenerationQuoteReturn,
} from '@genfeedai/props/studio/prompt-bar.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { ImagesService } from '@services/ingredients/images.service';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Stable effective-intent comparison; authorization hashes remain server-owned. */
export function serializeCrunQuoteIntent(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (typeof item === 'object' && item !== null)
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, entry]) => entry !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    return item;
  }
  return JSON.stringify(canonical(value));
}

export function useCrunGenerationQuote({
  request,
  isActive,
}: UseCrunGenerationQuoteOptions): UseCrunGenerationQuoteReturn {
  const auth = useAuthIdentity();
  const brand = useBrand();
  const desktop = isDesktopClient();
  const [runtimeRevision, setRuntimeRevision] = useState(0);
  const environmentRef = useRef<IDesktopBootstrap['environment'] | null>(null);
  const epochRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const currentRef = useRef({ auth, brand, request, isActive, desktop });
  currentRef.current = { auth, brand, request, isActive, desktop };
  const [refresh, setRefresh] = useState(0);
  const [record, setRecord] = useState<{
    scope: string;
    epoch: number;
    quote: CrunGenerationQuoteResponse | null;
    status: UseCrunGenerationQuoteReturn['status'];
  }>({ scope: '', epoch: 0, quote: null, status: 'idle' });
  const recordRef = useRef(record);
  recordRef.current = record;
  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );
  const readScope = useCallback(() => {
    const current = currentRef.current;
    const endpoint = EnvironmentService.apiEndpoint;
    const environment = environmentRef.current;
    if (
      !current.isActive ||
      !current.request ||
      !current.auth.isLoaded ||
      !current.auth.isSignedIn ||
      !current.auth.sessionId ||
      !current.auth.userId ||
      !current.brand.isReady ||
      !current.brand.organizationId ||
      !current.brand.brandId ||
      (current.desktop &&
        (!environment?.serverId || environment.apiEndpoint !== endpoint))
    )
      return null;
    return serializeCrunQuoteIntent([
      endpoint,
      current.desktop ? environment?.serverId : 'web',
      current.auth.sessionId,
      current.auth.userId,
      current.auth.orgId,
      current.brand.organizationId,
      current.brand.brandId,
      current.request.crunControls.contractVersion,
      serializeCrunQuoteIntent(current.request),
      runtimeRevision,
    ]);
  }, [runtimeRevision]);
  const scope = readScope();
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    epochRef.current += 1;
    controllerRef.current?.abort();
  }

  useEffect(() => {
    if (!desktop) return;
    const bridge = (
      globalThis as typeof globalThis & {
        genfeedDesktop?: IGenfeedDesktopBridge;
      }
    ).genfeedDesktop;
    const controller = new AbortController();
    let revision = 0;
    function apply(bootstrap: IDesktopBootstrap) {
      if (controller.signal.aborted) return;
      environmentRef.current = bootstrap.environment;
      epochRef.current += 1;
      controllerRef.current?.abort();
      setRuntimeRevision((value) => value + 1);
    }
    const unsubscribe = bridge?.app.onDidBootstrapChange((bootstrap) => {
      revision += 1;
      apply(bootstrap);
    });
    const initialRevision = revision;
    void bridge?.app
      .getBootstrap()
      .then((bootstrap) => {
        if (revision === initialRevision) apply(bootstrap);
      })
      .catch(() => {
        /* Missing server scope remains unavailable. */
      });
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [desktop]);

  const getCurrentQuote = useCallback(() => {
    const stored = recordRef.current;
    const live = readScope();
    if (
      !live ||
      stored.scope !== live ||
      stored.epoch !== epochRef.current ||
      !stored.quote?.isAvailable ||
      Date.parse(stored.quote.expiresAt) <= Date.now()
    )
      return null;
    return stored.quote;
  }, [readScope]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh intentionally schedules expiry/visibility requotes; scope contains the canonical request identity.
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const epoch = ++epochRef.current;
    const request = currentRef.current.request;
    if (!scope || !request || !currentRef.current.isActive) {
      setRecord({ scope: '', epoch, quote: null, status: 'idle' });
      return () => controller.abort();
    }
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    setRecord({ scope, epoch, quote: null, status: 'pending' });
    const timer = setTimeout(async () => {
      if (document.visibilityState === 'hidden' || controller.signal.aborted)
        return;
      try {
        const service = await getImagesService();
        if (
          controller.signal.aborted ||
          epoch !== epochRef.current ||
          readScope() !== scope
        )
          return;
        const quote = await service.quoteCrun(request, controller.signal);
        if (
          controller.signal.aborted ||
          epoch !== epochRef.current ||
          readScope() !== scope
        )
          return;
        setRecord({
          scope,
          epoch,
          quote,
          status: quote.isAvailable ? 'available' : 'unavailable',
        });
        if (quote.isAvailable)
          expiryTimer = setTimeout(
            () => {
              if (!controller.signal.aborted && readScope() === scope) {
                setRecord({ scope, epoch, quote: null, status: 'pending' });
                if (document.visibilityState !== 'hidden')
                  setRefresh((value) => value + 1);
              }
            },
            Math.max(0, Date.parse(quote.expiresAt) - Date.now()),
          );
      } catch (error) {
        if (
          controller.signal.aborted ||
          epoch !== epochRef.current ||
          readScope() !== scope ||
          (error instanceof Error && error.name === 'AbortError')
        )
          return;
        setRecord({ scope, epoch, quote: null, status: 'error' });
      }
    }, 300);
    const visible = () => {
      if (document.visibilityState !== 'hidden' && !getCurrentQuote())
        setRefresh((value) => value + 1);
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (expiryTimer) clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
    };
  }, [scope, refresh, getImagesService, getCurrentQuote, readScope]);
  const current = scope && record.scope === scope ? record : null;
  const quote = current?.quote?.isAvailable
    ? getCurrentQuote()
    : (current?.quote ?? null);
  const status = !scope
    ? 'idle'
    : !current
      ? 'pending'
      : current.status === 'available' && !quote
        ? 'pending'
        : current.status;
  return {
    status,
    quote,
    reasonCode:
      status === 'error'
        ? 'CRUN_PROVIDER_UNAVAILABLE'
        : quote && !quote.isAvailable
          ? quote.reasonCode
          : null,
    getCurrentQuote,
  };
}

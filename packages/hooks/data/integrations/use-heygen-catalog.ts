'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { useCallback, useEffect, useState } from 'react';

/** Each organization change clears the previous account's private catalog. */
export function useHeyGenCatalog() {
  const { organizationId } = useBrand();
  const getService = useAuthedService((token: string) =>
    HeyGenService.getInstance(token),
  );
  const [catalogOrganizationId, setCatalogOrganizationId] = useState<
    string | undefined
  >(undefined);
  const [avatars, setAvatars] = useState<HeyGenCatalogAvatar[]>([]);
  const [voices, setVoices] = useState<HeyGenCatalogVoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount explicitly requests a fresh catalogue load.
  useEffect(() => {
    const abort = new AbortController();
    // Keep already loaded choices during a retry; the organization binding
    // hides them immediately when the active organization changes.
    setError(null);
    setIsLoading(true);
    async function load() {
      try {
        const service = await getService();
        if (abort.signal.aborted) return;
        const [nextAvatars, nextVoices] = await Promise.allSettled([
          service.fetchAvatars(abort.signal),
          service.fetchVoices(abort.signal),
        ]);
        if (!abort.signal.aborted) {
          setCatalogOrganizationId(organizationId);
          setAvatars(
            nextAvatars.status === 'fulfilled' ? nextAvatars.value : [],
          );
          setVoices(nextVoices.status === 'fulfilled' ? nextVoices.value : []);
          const failed = [
            nextAvatars.status === 'rejected' && 'avatars',
            nextVoices.status === 'rejected' && 'voices',
          ].filter(Boolean);
          if (failed.length)
            setError(
              `HeyGen ${failed.join(' and ')} could not be loaded. Retry or check your connection in Integrations.`,
            );
        }
      } catch {
        if (!abort.signal.aborted) {
          setCatalogOrganizationId(organizationId);
          setAvatars([]);
          setVoices([]);
          setError(
            'HeyGen identities could not be loaded. Retry or check your connection in Integrations.',
          );
        }
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    }
    if (organizationId) void load();
    else setIsLoading(false);
    return () => abort.abort();
  }, [getService, organizationId, retryCount]);
  const matchesOrganization = catalogOrganizationId === organizationId;
  return {
    avatars: matchesOrganization ? avatars : [],
    voices: matchesOrganization ? voices : [],
    isLoading,
    error,
    retry,
  };
}

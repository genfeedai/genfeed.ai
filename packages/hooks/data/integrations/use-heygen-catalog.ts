'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { useEffect, useState } from 'react';

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
  useEffect(() => {
    const abort = new AbortController();
    setAvatars([]);
    setVoices([]);
    setError(null);
    setIsLoading(true);
    async function load() {
      try {
        const service = await getService();
        const [nextAvatars, nextVoices] = await Promise.all([
          service.fetchAvatars(abort.signal),
          service.fetchVoices(abort.signal),
        ]);
        if (!abort.signal.aborted) {
          setCatalogOrganizationId(organizationId);
          setAvatars(nextAvatars);
          setVoices(nextVoices);
        }
      } catch {
        if (!abort.signal.aborted)
          setError(
            'HeyGen identities could not be loaded. Check your connection in Integrations.',
          );
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    }
    if (organizationId) void load();
    else setIsLoading(false);
    return () => abort.abort();
  }, [getService, organizationId]);
  const matchesOrganization = catalogOrganizationId === organizationId;
  return {
    avatars: matchesOrganization ? avatars : [],
    voices: matchesOrganization ? voices : [],
    isLoading,
    error,
  };
}

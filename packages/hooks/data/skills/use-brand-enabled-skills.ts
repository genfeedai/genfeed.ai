'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const EMPTY_ENABLED_SKILL_SLUGS: string[] = [];

export interface UseBrandEnabledSkillsReturn {
  enabledSlugs: string[];
  isLoading: boolean;
  toggleSkill: (slug: string) => Promise<void>;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function useBrandEnabledSkills(): UseBrandEnabledSkillsReturn {
  const { getToken } = useAuthIdentity();
  const { isReady, refreshBrands, selectedBrand } = useBrand();
  const [enabledSlugs, setEnabledSlugs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const activeBrandIdRef = useRef<string | null>(null);
  const enabledSlugsRef = useRef<string[]>([]);
  const isLoadingRef = useRef(false);
  const mutationIdRef = useRef(0);

  const selectedBrandId = selectedBrand?.id ?? null;
  const persistedEnabledSlugs = useMemo(
    () =>
      selectedBrand?.agentConfig?.enabledSkills ?? EMPTY_ENABLED_SKILL_SLUGS,
    [selectedBrand?.agentConfig?.enabledSkills],
  );
  const persistedEnabledSlugsRef = useRef(persistedEnabledSlugs);
  persistedEnabledSlugsRef.current = persistedEnabledSlugs;

  useEffect(() => {
    mutationIdRef.current += 1;
    activeBrandIdRef.current = selectedBrandId;
    isLoadingRef.current = false;
    setIsLoading(false);

    if (!isReady || !selectedBrandId) {
      enabledSlugsRef.current = [];
      setEnabledSlugs((current) => (current.length === 0 ? current : []));
      return;
    }

    const nextPersistedSlugs = persistedEnabledSlugsRef.current;
    enabledSlugsRef.current = [...nextPersistedSlugs];
    setEnabledSlugs([...nextPersistedSlugs]);
  }, [isReady, selectedBrandId]);

  useEffect(() => {
    if (!isReady || !selectedBrandId || isLoadingRef.current) {
      return;
    }

    if (areStringArraysEqual(enabledSlugsRef.current, persistedEnabledSlugs)) {
      return;
    }

    enabledSlugsRef.current = [...persistedEnabledSlugs];
    setEnabledSlugs([...persistedEnabledSlugs]);
  }, [isReady, persistedEnabledSlugs, selectedBrandId]);

  const toggleSkill = useCallback(
    async (slug: string) => {
      if (!isReady || !selectedBrandId || isLoadingRef.current) return;

      const mutationId = ++mutationIdRef.current;
      const targetBrandId = selectedBrandId;
      const previousSlugs = enabledSlugsRef.current;
      const nextSlugs = previousSlugs.includes(slug)
        ? previousSlugs.filter((s) => s !== slug)
        : [...previousSlugs, slug];
      enabledSlugsRef.current = nextSlugs;
      setEnabledSlugs(nextSlugs);
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const token = await resolveAuthToken(getToken);
        if (!token) throw new Error('No auth token');

        const response = await fetch(
          `${API_BASE}/brands/${targetBrandId}/agent-config/enabled-skills`,
          {
            body: JSON.stringify({ enabledSkills: nextSlugs }),
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            method: 'PATCH',
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to update enabled skills: ${response.status}`,
          );
        }

        if (
          activeBrandIdRef.current === targetBrandId &&
          mutationIdRef.current === mutationId
        ) {
          // The server write is now authoritative. Allow the BrandContext
          // refresh below to reconcile any server-side normalization.
          isLoadingRef.current = false;
          try {
            await refreshBrands();
          } catch {
            // The write is already confirmed. Keep the optimistic value and
            // let the next brand refresh reconcile context instead of
            // presenting a false rollback for a successful server mutation.
          }
        }
      } catch {
        if (
          activeBrandIdRef.current === targetBrandId &&
          mutationIdRef.current === mutationId
        ) {
          enabledSlugsRef.current = previousSlugs;
          setEnabledSlugs(previousSlugs);
        }
      } finally {
        if (
          activeBrandIdRef.current === targetBrandId &&
          mutationIdRef.current === mutationId
        ) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [getToken, isReady, refreshBrands, selectedBrandId],
  );

  return { enabledSlugs, isLoading, toggleSkill };
}

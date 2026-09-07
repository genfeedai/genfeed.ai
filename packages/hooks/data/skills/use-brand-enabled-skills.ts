'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { BrandsService } from '@services/social/brands.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_ENABLED_SKILL_SLUGS: string[] = [];

export interface UseBrandEnabledSkillsOptions {
  /**
   * Slugs the runtime injects while the brand has no explicit selection.
   * They are reported as enabled and used as the base of the first toggle.
   */
  defaultSlugs?: string[];
}

export interface UseBrandEnabledSkillsReturn {
  enabledSlugs: string[];
  /** True while the brand runs on the first-party default set. */
  isUsingDefaults: boolean;
  isLoading: boolean;
  setUseDefaults: (isUsingDefaults: boolean) => Promise<void>;
  toggleSkill: (slug: string) => Promise<void>;
}

interface SkillSelection {
  enabledSkills: string[];
  useDefaultSkills: boolean;
}

function readPersistedSelection(
  agentConfig:
    | { enabledSkills?: string[]; useDefaultSkills?: boolean }
    | undefined,
): SkillSelection {
  const enabledSkills = agentConfig?.enabledSkills ?? EMPTY_ENABLED_SKILL_SLUGS;
  const useDefaultSkills =
    agentConfig?.useDefaultSkills ??
    // Legacy rule: no flag stored means defaults while the list is empty.
    enabledSkills.length === 0;

  return { enabledSkills, useDefaultSkills };
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function useBrandEnabledSkills({
  defaultSlugs = EMPTY_ENABLED_SKILL_SLUGS,
}: UseBrandEnabledSkillsOptions = {}): UseBrandEnabledSkillsReturn {
  const { getToken } = useAuthIdentity();
  const { isReady, refreshBrands, selectedBrand } = useBrand();
  const [selection, setSelection] = useState<SkillSelection>({
    enabledSkills: [],
    useDefaultSkills: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const activeBrandIdRef = useRef<string | null>(null);
  const selectionRef = useRef<SkillSelection>(selection);
  const isLoadingRef = useRef(false);
  const mutationIdRef = useRef(0);

  const selectedBrandId = selectedBrand?.id ?? null;
  const persistedSelection = useMemo(
    () => readPersistedSelection(selectedBrand?.agentConfig),
    [selectedBrand?.agentConfig],
  );
  const persistedSelectionRef = useRef(persistedSelection);
  persistedSelectionRef.current = persistedSelection;
  const defaultSlugsRef = useRef(defaultSlugs);
  defaultSlugsRef.current = defaultSlugs;

  const applySelection = useCallback((next: SkillSelection) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);

  useEffect(() => {
    mutationIdRef.current += 1;
    activeBrandIdRef.current = selectedBrandId;
    isLoadingRef.current = false;
    setIsLoading(false);

    if (!isReady || !selectedBrandId) {
      applySelection({ enabledSkills: [], useDefaultSkills: true });
      return;
    }

    applySelection({
      enabledSkills: [...persistedSelectionRef.current.enabledSkills],
      useDefaultSkills: persistedSelectionRef.current.useDefaultSkills,
    });
  }, [applySelection, isReady, selectedBrandId]);

  useEffect(() => {
    if (!isReady || !selectedBrandId || isLoadingRef.current) {
      return;
    }

    const current = selectionRef.current;
    if (
      current.useDefaultSkills === persistedSelection.useDefaultSkills &&
      areStringArraysEqual(
        current.enabledSkills,
        persistedSelection.enabledSkills,
      )
    ) {
      return;
    }

    applySelection({
      enabledSkills: [...persistedSelection.enabledSkills],
      useDefaultSkills: persistedSelection.useDefaultSkills,
    });
  }, [applySelection, isReady, persistedSelection, selectedBrandId]);

  const persistSelection = useCallback(
    async (nextSelection: SkillSelection) => {
      if (!isReady || !selectedBrandId || isLoadingRef.current) return;

      const mutationId = ++mutationIdRef.current;
      const targetBrandId = selectedBrandId;
      const previousSelection = selectionRef.current;
      applySelection(nextSelection);
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const token = await resolveAuthToken(getToken);
        if (!token) throw new Error('No auth token');

        await BrandsService.getInstance(token).updateEnabledSkills(
          targetBrandId,
          nextSelection,
        );

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
          applySelection(previousSelection);
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
    [applySelection, getToken, isReady, refreshBrands, selectedBrandId],
  );

  const toggleSkill = useCallback(
    async (slug: string) => {
      const current = selectionRef.current;
      // Changing one switch while defaults apply turns the brand into an
      // explicit selection that starts from the default set.
      const baseSlugs = current.useDefaultSkills
        ? defaultSlugsRef.current
        : current.enabledSkills;
      const enabledSkills = baseSlugs.includes(slug)
        ? baseSlugs.filter((s) => s !== slug)
        : [...baseSlugs, slug];

      await persistSelection({ enabledSkills, useDefaultSkills: false });
    },
    [persistSelection],
  );

  const setUseDefaults = useCallback(
    async (useDefaultSkills: boolean) => {
      const current = selectionRef.current;
      if (current.useDefaultSkills === useDefaultSkills) return;

      await persistSelection({
        // Turning defaults off keeps the default set as the starting point;
        // turning them on keeps the explicit list for when they go off again.
        enabledSkills: useDefaultSkills
          ? current.enabledSkills
          : [...defaultSlugsRef.current],
        useDefaultSkills,
      });
    },
    [persistSelection],
  );

  const enabledSlugs = useMemo(
    () => (selection.useDefaultSkills ? defaultSlugs : selection.enabledSkills),
    [defaultSlugs, selection],
  );

  return {
    enabledSlugs,
    isLoading,
    isUsingDefaults: selection.useDefaultSkills,
    setUseDefaults,
    toggleSkill,
  };
}

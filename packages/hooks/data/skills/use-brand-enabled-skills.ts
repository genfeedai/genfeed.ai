'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface UseBrandEnabledSkillsReturn {
  enabledSlugs: string[];
  isLoading: boolean;
  toggleSkill: (slug: string) => Promise<void>;
}

export function useBrandEnabledSkills(): UseBrandEnabledSkillsReturn {
  const { getToken } = useAuth();
  const { isReady, selectedBrand } = useBrand();
  const [enabledSlugs, setEnabledSlugs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isReady || !selectedBrand) return;

    const config = (selectedBrand as Record<string, unknown>).agentConfig as
      | { enabledSkills?: string[] }
      | undefined;
    setEnabledSlugs(config?.enabledSkills ?? []);
  }, [isReady, selectedBrand]);

  const toggleSkill = useCallback(
    async (slug: string) => {
      if (!selectedBrand) return;

      const brandId = (selectedBrand as Record<string, unknown>).id as string
        ?? (selectedBrand as Record<string, unknown>)._id as string;
      if (!brandId) return;

      const nextSlugs = enabledSlugs.includes(slug)
        ? enabledSlugs.filter((s) => s !== slug)
        : [...enabledSlugs, slug];

      // Optimistic update
      setEnabledSlugs(nextSlugs);

      try {
        const token = await resolveClerkToken(getToken);
        if (!token) throw new Error('No auth token');

        const response = await fetch(
          `${API_BASE}/brands/${brandId}/agent-config/enabled-skills`,
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
          throw new Error(`Failed to update enabled skills: ${response.status}`);
        }
      } catch {
        // Revert on failure
        setEnabledSlugs(enabledSlugs);
      }
    },
    [enabledSlugs, getToken, selectedBrand],
  );

  return { enabledSlugs, isLoading, toggleSkill };
}

'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
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
  const [isLoading, _setIsLoading] = useState(false);

  const selectedBrandRecord = selectedBrand as unknown as
    | {
        _id?: string;
        agentConfig?: {
          enabledSkills?: string[];
        };
        id?: string;
      }
    | undefined;

  useEffect(() => {
    if (!isReady || !selectedBrand) return;

    const config = selectedBrandRecord?.agentConfig;
    setEnabledSlugs(config?.enabledSkills ?? []);
  }, [isReady, selectedBrand, selectedBrandRecord]);

  const toggleSkill = useCallback(
    async (slug: string) => {
      if (!selectedBrand) return;

      const brandId = selectedBrandRecord?.id ?? selectedBrandRecord?._id;
      if (!brandId) return;

      // Capture pre-toggle state for rollback, then optimistically update.
      const previousSlugs = enabledSlugs;
      const nextSlugs = previousSlugs.includes(slug)
        ? previousSlugs.filter((s) => s !== slug)
        : [...previousSlugs, slug];
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
          throw new Error(
            `Failed to update enabled skills: ${response.status}`,
          );
        }
      } catch {
        // Restore exact pre-request state on failure
        setEnabledSlugs(previousSlugs);
      }
    },
    [enabledSlugs, getToken, selectedBrand, selectedBrandRecord],
  );

  return { enabledSlugs, isLoading, toggleSkill };
}

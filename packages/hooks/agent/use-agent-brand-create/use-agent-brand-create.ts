'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IBrand } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { Brand } from '@models/organization/brand.model';
import { BrandsService } from '@services/social/brands.service';
import { useCallback } from 'react';

export interface AgentBrandCreatePayload {
  name: string;
  description: string;
}

/**
 * Shared handler for the agent `brand_create_card`. Persists a brand
 * server-side through {@link BrandsService} (mirroring the brand modal's
 * `service.post(new Brand(...))` create path) and refreshes the brand context
 * so the new brand is immediately selectable.
 *
 * Previously the card only flipped a local `isCreated` flag with no handler
 * wired, so "Create Brand" in chat never created anything. The returned
 * callback rejects on failure so the card can surface the error.
 */
export function useAgentBrandCreate(): (
  payload: AgentBrandCreatePayload,
) => Promise<void> {
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const { organizationId, refreshBrands } = useBrand();

  return useCallback(
    async ({ name, description }: AgentBrandCreatePayload) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error('Brand name is required.');
      }

      const service = await getBrandsService();
      await service.post(
        new Brand({
          description: description.trim(),
          isDeleted: false,
          isSelected: false,
          label: trimmedName,
          ...(organizationId ? { organizationId } : {}),
        } as Partial<IBrand>),
      );

      await refreshBrands().catch(() => undefined);
    },
    [getBrandsService, organizationId, refreshBrands],
  );
}

'use client';

import type { IPublicBrandReach } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';

const BRAND_REACH_KEY = ['brand-profile', 'reach'] as const;

/**
 * The brand's lifetime views, impressions and engagements: the line the public
 * profile shows, read through the signed-in API so a private profile has it
 * too. `null` until the read answers or when it fails; the header then shows
 * no line, never zeros.
 */
export function useBrandReach(brandId: string): IPublicBrandReach | null {
  const { organizationId } = useCollectionScope();

  const query = useAuthedQuery({
    enabled: Boolean(organizationId && brandId),
    queryFn: async (service, signal) => {
      try {
        return await service.findBrandReach(brandId, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /brands/:id/reach failed', error);
        }
        throw error;
      }
    },
    queryKey: [...BRAND_REACH_KEY, brandId],
    service: (token: string) => BrandsService.getInstance(token),
  });

  return query.data ?? null;
}

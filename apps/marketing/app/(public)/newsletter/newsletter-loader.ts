import { GENFEED_BRAND_HANDLE } from '@genfeedai/contracts/constants';
import type { IPublicNewsletterIssue } from '@genfeedai/contracts/interfaces';
import type { GenfeedNewsletterArchive } from '@props/content/newsletter.props';
import { logger } from '@services/core/logger.service';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

/**
 * Genfeed's own newsletter archive: the brand behind genfeed.ai/@genfeedai,
 * sent from the same Newsletter module customers use. A failed request reads
 * as "unavailable" instead of a 500 on a public page.
 */
export const getGenfeedNewsletterArchive = cache(
  async (page: number): Promise<GenfeedNewsletterArchive> => {
    try {
      const service = PublicService.getInstance();
      const brand = await service.findPublicProfileBySlug(GENFEED_BRAND_HANDLE);
      if (!brand) return { archive: null, brand: null };
      const archive = await service.findNewsletterArchive(brand.id, page);
      return { archive, brand };
    } catch (error) {
      logger.warn('GET /newsletter degraded: archive unavailable', { error });
      return { archive: null, brand: null };
    }
  },
);

/** One published Genfeed issue, or null for anything else. */
export const getGenfeedNewsletterIssue = cache(
  async (id: string): Promise<IPublicNewsletterIssue | null> => {
    const issue = await PublicService.getInstance().findNewsletterIssue(id);
    return issue?.brand.slug === GENFEED_BRAND_HANDLE ? issue : null;
  },
);

/** Same page rule as the articles listing: anything odd is page one. */
export function resolveNewsletterPage(rawPage: string | undefined): number {
  const parsedPage = Number.parseInt(rawPage ?? '1', 10);
  return Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
}

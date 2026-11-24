'use client';

import type { StudioTurboProposal } from '@genfeedai/contracts/api-types/contracts';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { StudioProposalsService } from '@services/content/studio-proposals.service';
import { logger } from '@services/core/logger.service';

export interface UseTurboBrandIdeasReturn {
  isBrandApproved: boolean;
  proposals: readonly StudioTurboProposal[];
}

interface BrandIdeas {
  isBrandApproved: boolean;
  proposals: readonly StudioTurboProposal[];
}

const EMPTY_PROPOSALS: readonly StudioTurboProposal[] = [];
const NO_IDEAS: BrandIdeas = {
  isBrandApproved: true,
  proposals: EMPTY_PROPOSALS,
};
/** The Turbo landing shows three starters, like every suggestion grid. */
const TURBO_PROPOSAL_COUNT = 3;
/**
 * The ideas are an LLM call that takes seconds, so a brand's ideas are kept
 * for half an hour: coming back to Turbo paints them at once. An unapproved
 * brand is never kept, so approving the brand kit shows ideas on the next
 * visit.
 */
const IDEAS_STALE_MS = 30 * 60 * 1000;

/**
 * Agent-written Turbo starters for the brand (#7341): an angle, the formats and
 * a batch size, written from the brand kit and what has performed. The read
 * never holds the page: until it answers, and when it fails, the caller shows
 * the brand-neutral starters.
 */
export function useTurboBrandIdeas(
  brandId: string | undefined,
): UseTurboBrandIdeasReturn {
  const query = useAuthedQuery<StudioProposalsService, BrandIdeas>({
    enabled: Boolean(brandId),
    gcTime: IDEAS_STALE_MS,
    queryFn: async (service, signal) => {
      try {
        const result = await service.propose(brandId ?? '', 'turbo', {
          count: TURBO_PROPOSAL_COUNT,
          signal,
        });
        return {
          isBrandApproved: result.isBrandApproved,
          proposals:
            result.surface === 'turbo'
              ? result.proposals.slice(0, TURBO_PROPOSAL_COUNT)
              : EMPTY_PROPOSALS,
        };
      } catch (error: unknown) {
        if (signal.aborted) throw error;
        logger.error('Turbo brand ideas failed', error);
        return NO_IDEAS;
      }
    },
    queryKey: ['turbo-brand-ideas', brandId],
    refetchOnWindowFocus: false,
    retry: false,
    service: (token: string) => StudioProposalsService.getInstance(token),
    staleTime: (cached) =>
      cached.state.data?.isBrandApproved && cached.state.data.proposals.length
        ? IDEAS_STALE_MS
        : 0,
  });
  return query.data ?? NO_IDEAS;
}

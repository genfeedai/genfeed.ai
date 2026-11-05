'use client';

import type { StudioTurboProposal } from '@genfeedai/contracts/api-types/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StudioProposalsService } from '@services/content/studio-proposals.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

export interface UseTurboBrandIdeasReturn {
  isBrandApproved: boolean;
  isLoading: boolean;
  proposals: readonly StudioTurboProposal[];
}

interface BrandIdeasRecord {
  brandId: string;
  isBrandApproved: boolean;
  proposals: readonly StudioTurboProposal[];
}

const EMPTY_PROPOSALS: readonly StudioTurboProposal[] = [];
/** The Turbo landing shows three starters, like every suggestion grid. */
const TURBO_PROPOSAL_COUNT = 3;

/**
 * Agent-written Turbo starters for the brand (#7341): an angle, the formats and
 * a batch size, written from the brand kit and what has performed. A failed
 * call shows none, so the brand-neutral starters stay the fallback.
 */
export function useTurboBrandIdeas(
  brandId: string | undefined,
): UseTurboBrandIdeasReturn {
  const getService = useAuthedService((token: string) =>
    StudioProposalsService.getInstance(token),
  );
  const [record, setRecord] = useState<BrandIdeasRecord | null>(null);

  useEffect(() => {
    if (!brandId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getService();
        const result = await service.propose(brandId, 'turbo', {
          count: TURBO_PROPOSAL_COUNT,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRecord({
          brandId,
          isBrandApproved: result.isBrandApproved,
          proposals:
            result.surface === 'turbo'
              ? result.proposals.slice(0, TURBO_PROPOSAL_COUNT)
              : EMPTY_PROPOSALS,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        logger.error('Turbo brand ideas failed', error);
        setRecord({
          brandId,
          isBrandApproved: true,
          proposals: EMPTY_PROPOSALS,
        });
      }
    })();
    return () => controller.abort();
  }, [brandId, getService]);

  if (!brandId)
    return {
      isBrandApproved: true,
      isLoading: false,
      proposals: EMPTY_PROPOSALS,
    };
  if (record?.brandId !== brandId)
    return {
      isBrandApproved: true,
      isLoading: true,
      proposals: EMPTY_PROPOSALS,
    };
  return {
    isBrandApproved: record.isBrandApproved,
    isLoading: false,
    proposals: record.proposals,
  };
}

'use client';

import type { StudioStoryboardProposal } from '@genfeedai/contracts/api-types/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StudioProposalsService } from '@services/content/studio-proposals.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

export interface UseStoryboardAgentBriefsReturn {
  isBrandApproved: boolean;
  isLoading: boolean;
  proposals: readonly StudioStoryboardProposal[];
}

interface AgentBriefsRecord {
  brandId: string;
  isBrandApproved: boolean;
  proposals: readonly StudioStoryboardProposal[];
}

const EMPTY_PROPOSALS: readonly StudioStoryboardProposal[] = [];
/** The create page shows three briefs; the endpoint may return up to six. */
const STORYBOARD_BRIEF_COUNT = 3;

/**
 * Agent-written storyboard briefs with shot plans for the brand (#7341).
 * A failed call shows no briefs so the presets stay the fallback.
 */
export function useStoryboardAgentBriefs(
  brandId: string | undefined,
): UseStoryboardAgentBriefsReturn {
  const getService = useAuthedService((token: string) =>
    StudioProposalsService.getInstance(token),
  );
  const [record, setRecord] = useState<AgentBriefsRecord | null>(null);

  useEffect(() => {
    if (!brandId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getService();
        const result = await service.propose(brandId, 'storyboard', {
          count: STORYBOARD_BRIEF_COUNT,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRecord({
          brandId,
          isBrandApproved: result.isBrandApproved,
          proposals:
            result.surface === 'storyboard'
              ? result.proposals.slice(0, STORYBOARD_BRIEF_COUNT)
              : EMPTY_PROPOSALS,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        logger.error('Storyboard agent briefs failed', error);
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

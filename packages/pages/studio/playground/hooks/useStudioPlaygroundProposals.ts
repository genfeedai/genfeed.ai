'use client';

import type { StudioMediaProposal } from '@genfeedai/contracts/api-types/contracts';
import type { StudioPlaygroundType } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StudioProposalsService } from '@services/content/studio-proposals.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

export interface UseStudioPlaygroundProposalsReturn {
  isBrandApproved: boolean;
  isLoading: boolean;
  proposals: readonly StudioMediaProposal[];
}

interface ProposalsRecord {
  isBrandApproved: boolean;
  key: string;
  proposals: readonly StudioMediaProposal[];
}

const EMPTY_PROPOSALS: readonly StudioMediaProposal[] = [];

function proposalSurface(type: StudioPlaygroundType): 'image' | 'video' | null {
  return type === 'image' || type === 'video' ? type : null;
}

/**
 * Agent-written Playground drafts for the brand (#7341), from
 * `POST /brands/:brandId/content/studio-proposals`. Only image and video have
 * proposals; any other type, or no brand, asks for nothing. A failed call
 * shows no drafts so the starter ideas stay the fallback.
 */
export function useStudioPlaygroundProposals(
  brandId: string | undefined,
  type: StudioPlaygroundType,
): UseStudioPlaygroundProposalsReturn {
  const getService = useAuthedService((token: string) =>
    StudioProposalsService.getInstance(token),
  );
  const surface = proposalSurface(type);
  const key = brandId && surface ? `${brandId}:${surface}` : null;
  const [record, setRecord] = useState<ProposalsRecord | null>(null);

  useEffect(() => {
    if (!brandId || !surface || !key) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getService();
        const result = await service.propose(brandId, surface, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRecord({
          isBrandApproved: result.isBrandApproved,
          key,
          proposals:
            result.surface === 'storyboard'
              ? EMPTY_PROPOSALS
              : result.proposals,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        logger.error('Studio agent proposals failed', error);
        setRecord({ isBrandApproved: true, key, proposals: EMPTY_PROPOSALS });
      }
    })();
    return () => controller.abort();
  }, [brandId, getService, key, surface]);

  if (!key)
    return {
      isBrandApproved: true,
      isLoading: false,
      proposals: EMPTY_PROPOSALS,
    };
  if (record?.key !== key)
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

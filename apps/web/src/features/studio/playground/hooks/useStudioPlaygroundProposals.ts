'use client';

import type { StudioMediaProposal } from '@genfeedai/contracts/api-types/contracts';
import type { StudioPlaygroundType } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
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
/** The Playground shows three drafts; the endpoint may return up to six. */
const PLAYGROUND_PROPOSAL_COUNT = 3;
/**
 * Proposals are an LLM call. Successful results are kept for the page's life
 * per identity, brand and surface, so clearing the prompt or switching type
 * back does not draft again. Failed and aborted calls, and an unapproved
 * brand (approving it should show drafts), are never kept.
 */
const proposalsCache = new Map<string, ProposalsRecord>();

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
  const { orgId, sessionId, userId } = useAuthIdentity();
  const surface = proposalSurface(type);
  const key =
    brandId && surface
      ? JSON.stringify([sessionId, userId, orgId, brandId, surface])
      : null;
  const [record, setRecord] = useState<ProposalsRecord | null>(null);
  const cached = key ? proposalsCache.get(key) : undefined;

  useEffect(() => {
    if (!brandId || !surface || !key || proposalsCache.has(key)) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getService();
        const result = await service.propose(brandId, surface, {
          count: PLAYGROUND_PROPOSAL_COUNT,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const next = {
          isBrandApproved: result.isBrandApproved,
          key,
          proposals:
            result.surface === 'storyboard'
              ? EMPTY_PROPOSALS
              : result.proposals.slice(0, PLAYGROUND_PROPOSAL_COUNT),
        };
        if (next.isBrandApproved) proposalsCache.set(key, next);
        setRecord(next);
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
  const current = cached ?? (record?.key === key ? record : null);
  if (!current)
    return {
      isBrandApproved: true,
      isLoading: true,
      proposals: EMPTY_PROPOSALS,
    };
  return {
    isBrandApproved: current.isBrandApproved,
    isLoading: false,
    proposals: current.proposals,
  };
}

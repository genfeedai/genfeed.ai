'use client';

import type {
  SocialPlatform,
  SocialReplyCampaignInput,
  SocialReplyCampaignQuery,
} from '@genfeedai/interfaces';
import type { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  SocialReplyCampaignsService,
  type SocialReplyCampaignTransition,
} from '@services/social/reply-campaigns.service';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_BRANDS_FILTER,
  getMessagesErrorMessage,
  isAbortLike,
} from './messages-page.helpers';

export interface UseReplyCampaignsParams {
  /** Brand filter shared with the inbox, or `all` when the surface is org-wide. */
  readonly brandFilter: string;
  readonly isEnabled: boolean;
  readonly platform: SocialPlatform | 'all';
}

export function useReplyCampaigns({
  brandFilter,
  isEnabled,
  platform,
}: UseReplyCampaignsParams) {
  const [campaigns, setCampaigns] = useState<SocialReplyCampaignModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCampaignsService = useAuthedService((token) =>
    SocialReplyCampaignsService.getInstance(token),
  );

  const query = useMemo((): SocialReplyCampaignQuery => {
    return {
      limit: 25,
      page: 1,
      ...(brandFilter === ALL_BRANDS_FILTER ? {} : { brandId: brandFilter }),
      ...(platform === 'all' ? {} : { platform }),
    };
  }, [brandFilter, platform]);

  const loadCampaigns = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);

      try {
        const service = await getCampaignsService();
        const result = await service.listPage(query, signal);
        if (signal?.aborted) {
          return;
        }

        setCampaigns(result.items);
        setError(null);
      } catch (err: unknown) {
        if (!isAbortLike(err)) {
          setError(getMessagesErrorMessage(err));
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getCampaignsService, query],
  );

  // The panel is a drawer: nothing is fetched until it is actually opened, so an
  // untouched inbox never pays for a campaigns request.
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const controller = new AbortController();
    void loadCampaigns(controller.signal);
    return () => controller.abort();
  }, [isEnabled, loadCampaigns]);

  const refresh = useCallback(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const createCampaign = useCallback(
    async (input: SocialReplyCampaignInput) => {
      setIsCreating(true);
      setError(null);

      try {
        const service = await getCampaignsService();
        const campaign = await service.createCampaign(input);
        setCampaigns((current) => [campaign, ...current]);
      } catch (err: unknown) {
        setError(getMessagesErrorMessage(err));
      } finally {
        setIsCreating(false);
      }
    },
    [getCampaignsService],
  );

  const transitionCampaign = useCallback(
    async (campaignId: string, transition: SocialReplyCampaignTransition) => {
      setBusyCampaignId(campaignId);
      setError(null);

      try {
        const service = await getCampaignsService();
        const campaign = await service.transition(campaignId, transition);
        setCampaigns((current) =>
          current.map((item) => (item.id === campaign.id ? campaign : item)),
        );
      } catch (err: unknown) {
        setError(getMessagesErrorMessage(err));
      } finally {
        setBusyCampaignId(null);
      }
    },
    [getCampaignsService],
  );

  return {
    busyCampaignId,
    campaigns,
    createCampaign,
    error,
    isCreating,
    isLoading,
    refresh,
    transitionCampaign,
  };
}

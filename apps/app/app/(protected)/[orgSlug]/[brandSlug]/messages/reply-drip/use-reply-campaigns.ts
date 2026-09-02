'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import type {
  SocialPlatform,
  SocialReplyCampaignInput,
  SocialReplyCampaignQuery,
} from '@genfeedai/contracts/interfaces';
import type { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import type { ReplyCampaignEnrollableConversation } from '@genfeedai/props/social/reply-campaigns-panel.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { SocialMessagesService } from '@services/social/messages.service';
import {
  SocialReplyCampaignsService,
  type SocialReplyCampaignTransition,
} from '@services/social/reply-campaigns.service';
import { useCallback, useEffect, useMemo, useState } from 'react';

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return 'An unexpected error occurred';
}

function isAbortLike(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const name = 'name' in err ? String(err.name) : '';
  const code = 'code' in err ? String(err.code) : '';
  return name === 'AbortError' || code === 'ERR_CANCELED';
}

export function useReplyCampaigns() {
  const { selectedBrand } = useBrand();
  const brandId = getBrandEntityId(selectedBrand) || undefined;

  const [campaigns, setCampaigns] = useState<SocialReplyCampaignModel[]>([]);
  const [enrollableConversations, setEnrollableConversations] = useState<
    ReplyCampaignEnrollableConversation[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCampaignsService = useAuthedService((token) =>
    SocialReplyCampaignsService.getInstance(token),
  );
  const getMessagesService = useAuthedService((token) =>
    SocialMessagesService.getInstance(token),
  );

  const campaignQuery = useMemo((): SocialReplyCampaignQuery => {
    return {
      limit: 50,
      page: 1,
      ...(brandId ? { brandId } : {}),
    };
  }, [brandId]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);

      try {
        const [campaignsService, messagesService] = await Promise.all([
          getCampaignsService(),
          getMessagesService(),
        ]);

        const [campaignPage, conversationPage] = await Promise.all([
          campaignsService.listPage(campaignQuery, signal),
          messagesService.listPage(
            {
              limit: 100,
              page: 1,
              ...(brandId ? { brandId } : {}),
            },
            signal,
          ),
        ]);

        if (signal?.aborted) {
          return;
        }

        setCampaigns(campaignPage.items);
        setEnrollableConversations(
          conversationPage.items.map((conversation) => ({
            id: conversation.id,
            platform: conversation.platform as SocialPlatform,
          })),
        );
        setError(null);
      } catch (err: unknown) {
        if (!isAbortLike(err)) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [brandId, campaignQuery, getCampaignsService, getMessagesService],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  const createCampaign = useCallback(
    async (input: SocialReplyCampaignInput) => {
      setIsCreating(true);
      setError(null);

      try {
        const service = await getCampaignsService();
        const campaign = await service.createCampaign(input);
        setCampaigns((current) => [campaign, ...current]);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
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
        setError(getErrorMessage(err));
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
    enrollableConversations,
    error,
    isCreating,
    isLoading,
    refresh,
    transitionCampaign,
  };
}

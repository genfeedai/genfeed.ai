import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import type {
  SocialPlatform,
  SocialReplyCampaignInput,
  SocialReplyCampaignQuery,
} from '@genfeedai/contracts/interfaces';
import type { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { SocialMessagesService } from '@services/social/messages.service';
import {
  SocialReplyCampaignsService,
  type SocialReplyCampaignTransition,
} from '@services/social/reply-campaigns.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { ReplyCampaignEnrollableConversation } from '@/features/messages/props/reply-campaigns-panel.props';

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return 'An unexpected error occurred';
}

const REPLY_CAMPAIGNS_KEY = 'reply-campaigns';
const ENROLLABLE_CONVERSATIONS_KEY = 'reply-campaign-enrollable-conversations';
const CONVERSATION_LIMIT = 100;
const EMPTY_CAMPAIGNS: SocialReplyCampaignModel[] = [];
const EMPTY_CONVERSATIONS: ReplyCampaignEnrollableConversation[] = [];

export function useReplyCampaigns() {
  const { selectedBrand } = useBrand();
  const brandId = getBrandEntityId(selectedBrand) || undefined;

  const [isCreating, setIsCreating] = useState(false);
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const getCampaignsService = useAuthedService((token) =>
    SocialReplyCampaignsService.getInstance(token),
  );
  const queryClient = useQueryClient();

  const campaignQuery = useMemo((): SocialReplyCampaignQuery => {
    return {
      limit: 50,
      page: 1,
      ...(brandId ? { brandId } : {}),
    };
  }, [brandId]);

  // Both lists are cached per viewer and brand, so coming back to Reply drip
  // paints them at once and refreshes them in the background.
  const campaignsScopeKey = useMemo(
    () => [REPLY_CAMPAIGNS_KEY, brandId ?? null],
    [brandId],
  );
  const campaignsQuery = useAuthedQuery<
    SocialReplyCampaignsService,
    SocialReplyCampaignModel[]
  >({
    queryFn: async (service, signal) =>
      (await service.listPage(campaignQuery, signal)).items,
    queryKey: [...campaignsScopeKey, campaignQuery],
    service: (token: string) => SocialReplyCampaignsService.getInstance(token),
  });
  const conversationsQuery = useAuthedQuery<
    SocialMessagesService,
    ReplyCampaignEnrollableConversation[]
  >({
    queryFn: async (service, signal) => {
      const conversationPage = await service.listPage(
        {
          limit: CONVERSATION_LIMIT,
          page: 1,
          ...(brandId ? { brandId } : {}),
        },
        signal,
      );
      return conversationPage.items.map((conversation) => ({
        id: conversation.id,
        platform: conversation.platform as SocialPlatform,
      }));
    },
    queryKey: [
      ENROLLABLE_CONVERSATIONS_KEY,
      brandId ?? null,
      { limit: CONVERSATION_LIMIT },
    ],
    service: (token: string) => SocialMessagesService.getInstance(token),
  });

  const campaigns = campaignsQuery.data ?? EMPTY_CAMPAIGNS;
  const enrollableConversations =
    conversationsQuery.data ?? EMPTY_CONVERSATIONS;
  const isLoading = campaignsQuery.isPending || conversationsQuery.isPending;
  // A failed background refresh keeps the lists on screen without an alert;
  // a load error shows only while there is nothing to show.
  const loadError =
    (campaignsQuery.data === undefined ? campaignsQuery.error : null) ??
    (conversationsQuery.data === undefined ? conversationsQuery.error : null);
  const error = actionError ?? (loadError ? getErrorMessage(loadError) : null);

  const { refetch: refetchCampaigns } = campaignsQuery;
  const { refetch: refetchConversations } = conversationsQuery;
  const refresh = useCallback(() => {
    setActionError(null);
    void refetchCampaigns();
    void refetchConversations();
  }, [refetchCampaigns, refetchConversations]);

  const updateCampaigns = useCallback(
    (
      queryKey: readonly unknown[],
      update: (
        current: SocialReplyCampaignModel[],
      ) => SocialReplyCampaignModel[],
    ) => {
      queryClient.setQueriesData<SocialReplyCampaignModel[]>(
        { queryKey },
        (current) => (current ? update(current) : current),
      );
    },
    [queryClient],
  );

  const createCampaign = useCallback(
    async (input: SocialReplyCampaignInput) => {
      setIsCreating(true);
      setActionError(null);

      try {
        const service = await getCampaignsService();
        const campaign = await service.createCampaign(input);
        updateCampaigns(campaignsScopeKey, (current) => [campaign, ...current]);
      } catch (err: unknown) {
        setActionError(getErrorMessage(err));
      } finally {
        setIsCreating(false);
      }
    },
    [campaignsScopeKey, getCampaignsService, updateCampaigns],
  );

  const transitionCampaign = useCallback(
    async (campaignId: string, transition: SocialReplyCampaignTransition) => {
      setBusyCampaignId(campaignId);
      setActionError(null);

      try {
        const service = await getCampaignsService();
        const campaign = await service.transition(campaignId, transition);
        updateCampaigns([REPLY_CAMPAIGNS_KEY], (current) =>
          current.map((item) => (item.id === campaign.id ? campaign : item)),
        );
      } catch (err: unknown) {
        setActionError(getErrorMessage(err));
      } finally {
        setBusyCampaignId(null);
      }
    },
    [getCampaignsService, updateCampaigns],
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

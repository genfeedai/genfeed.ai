'use client';

import type {
  ISocialIntelligenceTopicBundle,
  ListeningInboxScope,
  ReviewListeningThemeState,
  SocialIntelligenceInboxState,
} from '@genfeedai/contracts/interfaces';
import type { IStructuredError } from '@genfeedai/contracts/interfaces/utils/error.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ListeningTopicsService } from '@services/social/listening-topics.service';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

interface UseSocialIntelligenceOptions extends ListeningInboxScope {
  enabled?: boolean;
}

interface UseSocialIntelligenceResult {
  errorMessage: string | null;
  isReviewing: boolean;
  items: ISocialIntelligenceTopicBundle[];
  partialReason: string | null;
  retry: () => Promise<void>;
  reviewTheme: (
    topicId: string,
    themeId: string,
    state: ReviewListeningThemeState,
  ) => Promise<void>;
  state: SocialIntelligenceInboxState;
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const structured = error as IStructuredError & {
    response?: { status?: number };
  };
  return structured.status ?? structured.response?.status;
}

function describePartialCoverage(
  items: ISocialIntelligenceTopicBundle[],
): string | null {
  const reasons = new Set<string>();

  for (const { signals, themes, topic } of items) {
    const excluded = new Set(
      signals.flatMap((signal) => signal.excludedSourceIds ?? []),
    );
    for (const source of topic.sources) {
      const isMissing =
        excluded.has(source.sourceId) ||
        source.collectionState === 'failed' ||
        source.collectionState === 'rate_limited';
      if (!isMissing) {
        continue;
      }
      const detail =
        source.lastCollectionError ??
        (source.collectionState === 'rate_limited'
          ? 'Source is rate limited'
          : 'No evidence in both comparison windows');
      reasons.add(`${source.platform}: ${detail}`);
    }

    const insufficiencyReasons = signals
      .map((signal) => signal.insufficiencyReason)
      .filter((reason): reason is NonNullable<typeof reason> =>
        Boolean(reason),
      );
    for (const reason of insufficiencyReasons) {
      reasons.add(reason.replaceAll('_', ' '));
    }
    if (themes.some((theme) => theme.evidenceIds.length === 0)) {
      reasons.add('theme has no attributable evidence');
    }
  }

  return reasons.size > 0
    ? `Partial source coverage — ${[...reasons].join('; ')}`
    : null;
}

export function useSocialIntelligence({
  brandId,
  organizationId,
  enabled = true,
}: UseSocialIntelligenceOptions): UseSocialIntelligenceResult {
  const scope = useMemo(
    () => ({ brandId, organizationId }),
    [brandId, organizationId],
  );
  const getListeningTopicsService = useAuthedService((token: string) =>
    ListeningTopicsService.getInstance(token),
  );
  const queryKey = ['social-intelligence-inbox', organizationId, brandId];
  const query = useQuery({
    enabled: enabled && Boolean(organizationId && brandId),
    queryFn: async ({ signal }) => {
      const service = await getListeningTopicsService();
      return service.getSocialIntelligenceInbox(scope, signal);
    },
    queryKey,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      state,
      themeId,
      topicId,
    }: {
      state: ReviewListeningThemeState;
      themeId: string;
      topicId: string;
    }) => {
      const service = await getListeningTopicsService();
      return service.reviewTheme(topicId, themeId, state, scope);
    },
    onSuccess: async () => {
      await query.refetch();
    },
  });

  const items = query.data ?? [];
  const partialReason = useMemo(() => describePartialCoverage(items), [items]);
  let state: SocialIntelligenceInboxState;
  if (query.isLoading) {
    state = 'loading';
  } else if (query.error) {
    const status = getErrorStatus(query.error);
    state =
      status === 403 ? 'forbidden' : status === 429 ? 'rate_limited' : 'failed';
  } else if (
    items.length === 0 ||
    items.every(({ themes }) => themes.length === 0)
  ) {
    state = 'empty';
  } else {
    state = partialReason ? 'partial' : 'ready';
  }

  const retry = useCallback(async () => {
    await query.refetch();
  }, [query]);
  const reviewTheme = useCallback(
    async (
      topicId: string,
      themeId: string,
      reviewState: ReviewListeningThemeState,
    ) => {
      await reviewMutation.mutateAsync({
        state: reviewState,
        themeId,
        topicId,
      });
    },
    [reviewMutation],
  );

  return {
    errorMessage: query.error instanceof Error ? query.error.message : null,
    isReviewing: reviewMutation.isPending,
    items,
    partialReason,
    retry,
    reviewTheme,
    state,
  };
}

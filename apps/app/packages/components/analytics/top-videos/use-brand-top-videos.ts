import { useOptionalAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { Timeframe } from '@genfeedai/contracts';
import type {
  IBrand,
  ITrendVideo,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import type { Video } from '@genfeedai/models/ingredients/video.model';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import {
  evaluationReadRevision,
  evaluationVideoCache,
  evaluationVideosQueryKey,
  useEvaluationReadScopeKey,
} from '@hooks/ui/evaluation/use-evaluation/evaluation-read-cache';
import { OutlierBaselinesService } from '@services/analytics/outlier-baselines.service';
import { logger } from '@services/core/logger.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { getPersuasionHighlight } from './persuasion-highlight.util';

export type TopVideosTimeframe = Timeframe.H24 | Timeframe.H72 | Timeframe.D7;

const TOP_VIDEOS_CACHE_TTL = 30 * 60 * 1000;
const TOP_VIDEOS_TIMEFRAMES: readonly string[] = [
  Timeframe.H24,
  Timeframe.H72,
  Timeframe.D7,
];
const VIDEO_TIMEFRAME_MS = {
  [Timeframe.H24]: 24 * 60 * 60 * 1000,
  [Timeframe.H72]: 72 * 60 * 60 * 1000,
  [Timeframe.D7]: 7 * 24 * 60 * 60 * 1000,
} as const;

export function normalizeBrandVideo(video: Video): ITrendVideo {
  const ingredient = video as IVideo;
  const evaluation = ingredient.evaluation;
  const evaluationData = evaluation?.data;
  const actualPerformance = evaluationData?.actualPerformance;
  const engagementScores = evaluationData?.scores?.engagement;
  const brand =
    typeof ingredient.brand === 'object'
      ? (ingredient.brand as IBrand)
      : undefined;

  return {
    creatorHandle: brand?.label || 'Your brand',
    description: video.metadataDescription || undefined,
    engagementRate: actualPerformance?.engagementRate ?? 0,
    id: video.id || '',
    persuasionHighlight: getPersuasionHighlight(
      evaluationData?.status === 'completed'
        ? evaluationData.scores?.persuasion
        : undefined,
      evaluationData?.analysis?.strengths,
    ),
    platform:
      evaluationData?.externalContent?.platform ||
      ingredient.provider ||
      'genfeed',
    publishedAt: ingredient.publishedAt || video.createdAt,
    thumbnailUrl: video.thumbnailUrl,
    title: video.metadataLabel || video.id?.slice(0, 8) || 'Untitled video',
    velocity: actualPerformance?.engagement ?? 0,
    videoUrl: video.ingredientUrl,
    viralScore:
      engagementScores?.viralityPotential ?? evaluationData?.overallScore ?? 0,
    views: actualPerformance?.views ?? 0,
  };
}

/**
 * The brand's own recent videos with evaluation scores, persuasion highlights
 * and outlier baselines — measurement of what *you* published, so it lives in
 * Analytics › Outliers, not in Discovery's market trends.
 */
export function useBrandTopVideos() {
  const collectionScope = useCollectionScope();
  const { brandId } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const analyticsContext = useOptionalAnalyticsContext();
  const setSurfaceFilter = analyticsContext?.setFilter;
  const restoredTimeframe = analyticsContext?.filters?.timeframe;
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );
  const getOutlierService = useAuthedService((token: string) =>
    OutlierBaselinesService.getInstance(token),
  );

  const [localTimeframe, setLocalTimeframe] = useState<TopVideosTimeframe>(
    Timeframe.H72,
  );
  const timeframe = TOP_VIDEOS_TIMEFRAMES.includes(restoredTimeframe ?? '')
    ? (restoredTimeframe as TopVideosTimeframe)
    : localTimeframe;
  const setTimeframe = useCallback(
    (value: TopVideosTimeframe) => {
      setLocalTimeframe(value);
      setSurfaceFilter?.('timeframe', value);
    },
    [setSurfaceFilter],
  );

  const evaluationScopeKey = useEvaluationReadScopeKey();
  const {
    data: videoRead,
    isLoading,
    refetch: retryRead,
  } = useQuery({
    enabled: isBrandReady && Boolean(evaluationScopeKey),
    queryKey: evaluationVideosQueryKey(evaluationScopeKey),
    queryFn: async ({ signal }) => {
      if (!evaluationScopeKey)
        throw new Error('Evaluation read scope is unavailable');
      const revision = evaluationReadRevision(evaluationScopeKey);
      try {
        const service = await getVideosService();
        signal.throwIfAborted();
        const videos = await service.findAll(
          {
            brand: brandId,
            lightweight: true,
            limit: 12,
            sort: 'createdAt: -1',
          },
          signal,
        );
        signal.throwIfAborted();
        if (evaluationReadRevision(evaluationScopeKey) !== revision)
          throw new DOMException('Evaluation read changed', 'AbortError');
        const normalizedVideos = videos.map(normalizeBrandVideo);
        evaluationVideoCache.set(
          evaluationScopeKey,
          normalizedVideos,
          TOP_VIDEOS_CACHE_TTL,
        );
        return { videos: normalizedVideos, isCached: false, hasError: false };
      } catch (error) {
        if (
          signal.aborted ||
          evaluationReadRevision(evaluationScopeKey) !== revision
        )
          throw error;
        logger.error('Failed to fetch brand top videos', { error });
        const cached = evaluationVideoCache.get(evaluationScopeKey);
        return {
          videos: cached ?? [],
          isCached: cached !== null,
          hasError: true,
        };
      }
    },
    refetchOnMount: 'always',
    retry: false,
    staleTime: TOP_VIDEOS_CACHE_TTL,
  });
  const brandVideos = videoRead?.videos ?? [];

  const { data: outlierPosts = [] } = useQuery({
    enabled: isBrandReady,
    queryFn: async ({ signal }) => {
      const service = await getOutlierService();
      const page = await service.listPosts({ brandId, limit: 50 }, signal);
      return page.docs;
    },
    queryKey: ['analytics-top-videos-outliers', brandId],
    retry: false,
    staleTime: TOP_VIDEOS_CACHE_TTL,
  });

  const videos = useMemo(() => {
    const cutoff = Date.now() - VIDEO_TIMEFRAME_MS[timeframe];
    const byPostId = new Map(
      outlierPosts
        .filter((post) => post.postId)
        .map((post) => [post.postId as string, post]),
    );

    return brandVideos
      .filter((video) => {
        const publishedAt = new Date(video.publishedAt ?? 0).getTime();
        return Number.isFinite(publishedAt) && publishedAt >= cutoff;
      })
      .map((video) => {
        const match = byPostId.get(video.id);
        if (!match) return video;
        return {
          ...video,
          medianViews: match.medianViews,
          outlierRatio: match.outlierRatio,
          sampleSize: match.sampleSize,
        };
      });
  }, [brandVideos, outlierPosts, timeframe]);

  return {
    hasReadError: videoRead?.hasError ?? false,
    isBrandReady,
    isLoading,
    isUsingCachedVideos: videoRead?.isCached ?? false,
    retryRead,
    setTimeframe,
    timeframe,
    videos,
  };
}

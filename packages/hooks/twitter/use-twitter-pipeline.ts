'use client';

import type {
  ITwitterOpportunity,
  ITwitterPublishRequest,
  ITwitterPublishResult,
  ITwitterSearchResult,
  ITwitterVoiceConfig,
} from '@cloud/interfaces';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { TwitterPipelineService } from '@services/twitter/twitter-pipeline.service';
import { useCallback, useEffect, useRef, useState } from 'react';

type PipelineStatus =
  | 'idle'
  | 'searching'
  | 'drafting'
  | 'ready'
  | 'publishing'
  | 'done';

interface UseTwitterPipelineOptions {
  orgId: string;
  brandId: string;
  token: string;
}

interface UseTwitterPipelineReturn {
  search: (voiceConfig: ITwitterVoiceConfig) => Promise<void>;
  draft: (
    voiceConfig: ITwitterVoiceConfig,
    tweets: ITwitterSearchResult[],
  ) => Promise<void>;
  publish: (
    dto: ITwitterPublishRequest,
  ) => Promise<ITwitterPublishResult | undefined>;
  reset: () => void;
  searchResults: ITwitterSearchResult[];
  opportunities: ITwitterOpportunity[];
  publishResult: ITwitterPublishResult | null;
  status: PipelineStatus;
  isLoading: boolean;
  error: string | null;
}

export function useTwitterPipeline(
  options: UseTwitterPipelineOptions,
): UseTwitterPipelineReturn {
  const { orgId, brandId, token } = options;
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [searchResults, setSearchResults] = useState<ITwitterSearchResult[]>(
    [],
  );
  const [opportunities, setOpportunities] = useState<ITwitterOpportunity[]>([]);
  const [publishResult, setPublishResult] =
    useState<ITwitterPublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const isLoading =
    status === 'searching' || status === 'drafting' || status === 'publishing';

  const search = useCallback(
    async (voiceConfig: ITwitterVoiceConfig) => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setStatus('searching');
      setError(null);
      setSearchResults([]);
      setOpportunities([]);
      setPublishResult(null);

      try {
        const service = TwitterPipelineService.getInstance(token);
        const results = await service.search(orgId, brandId, voiceConfig);
        setSearchResults(results);
        setStatus('ready');
      } catch (err: unknown) {
        const isCancelled =
          err instanceof Error && err.message?.includes('abort');

        if (!isCancelled) {
          const message = err instanceof Error ? err.message : 'Search failed';
          setError(message);
          setStatus('idle');
          logger.error('useTwitterPipeline.search failed', err);
          NotificationsService.getInstance().error('Failed to search tweets');
        }
      }
    },
    [orgId, brandId, token],
  );

  const draft = useCallback(
    async (
      voiceConfig: ITwitterVoiceConfig,
      tweets: ITwitterSearchResult[],
    ) => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setStatus('drafting');
      setError(null);
      setOpportunities([]);

      try {
        const service = TwitterPipelineService.getInstance(token);
        const results = await service.draft(orgId, tweets, voiceConfig);
        setOpportunities(results);
        setStatus('ready');
      } catch (err: unknown) {
        const isCancelled =
          err instanceof Error && err.message?.includes('abort');

        if (!isCancelled) {
          const message =
            err instanceof Error ? err.message : 'Draft generation failed';
          setError(message);
          setStatus('ready');
          logger.error('useTwitterPipeline.draft failed', err);
          NotificationsService.getInstance().error('Failed to generate drafts');
        }
      }
    },
    [orgId, token],
  );

  const publish = useCallback(
    async (
      dto: ITwitterPublishRequest,
    ): Promise<ITwitterPublishResult | undefined> => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setStatus('publishing');
      setError(null);

      try {
        const service = TwitterPipelineService.getInstance(token);
        const result = await service.publish(orgId, brandId, dto);
        setPublishResult(result);
        setStatus('done');
        return result;
      } catch (err: unknown) {
        const isCancelled =
          err instanceof Error && err.message?.includes('abort');

        if (!isCancelled) {
          const message = err instanceof Error ? err.message : 'Publish failed';
          setError(message);
          setStatus('ready');
          logger.error('useTwitterPipeline.publish failed', err);
          NotificationsService.getInstance().error('Failed to publish tweet');
        }

        return undefined;
      }
    },
    [orgId, brandId, token],
  );

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus('idle');
    setSearchResults([]);
    setOpportunities([]);
    setPublishResult(null);
    setError(null);
  }, []);

  return {
    draft,
    error,
    isLoading,
    opportunities,
    publish,
    publishResult,
    reset,
    search,
    searchResults,
    status,
  };
}

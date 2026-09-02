'use client';

import type { ICreativePattern } from '@genfeedai/contracts/interfaces';
import type { PatternLabFilters } from '@genfeedai/props/analytics/performance-lab.props';
import { CreativePatternsService } from '@genfeedai/services/analytics/creative-patterns.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useEffect, useState } from 'react';

export interface UsePatternContextReturn {
  patterns: ICreativePattern[];
  isLoading: boolean;
  error: string | null;
}

export function usePatternContext(
  filters?: PatternLabFilters,
): UsePatternContextReturn {
  const { brandId } = useCollectionScope();
  const getCreativePatternsService = useAuthedService((token: string) =>
    CreativePatternsService.getInstance(token),
  );
  const [patterns, setPatterns] = useState<ICreativePattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    setError(null);

    void getCreativePatternsService()
      .then((service) =>
        service.findAll(
          {
            brandId: brandId || undefined,
            patternType: filters?.patternType,
            platform: filters?.platform,
            scope: filters?.scope,
          },
          controller.signal,
        ),
      )
      .then((nextPatterns) => {
        if (controller.signal.aborted) {
          return;
        }
        setPatterns(nextPatterns);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load patterns';
        logger.error('usePatternContext: fetch failed', {
          error: err,
          reportToSentry: false,
        });
        setError(message);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [
    brandId,
    filters?.platform,
    filters?.patternType,
    filters?.scope,
    getCreativePatternsService,
  ]);

  return { error, isLoading, patterns };
}

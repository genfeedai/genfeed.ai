'use client';

import type { ICreativePattern } from '@cloud/interfaces';
import type { PatternLabFilters } from '@props/analytics/performance-lab.props';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

export interface UsePatternContextReturn {
  patterns: ICreativePattern[];
  isLoading: boolean;
  error: string | null;
}

export function usePatternContext(
  filters?: PatternLabFilters,
): UsePatternContextReturn {
  const [patterns, setPatterns] = useState<ICreativePattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const params = new URLSearchParams();
    if (filters?.platform) {
      params.set('platform', filters.platform);
    }
    if (filters?.patternType) {
      params.set('patternType', filters.patternType);
    }
    if (filters?.scope) {
      params.set('scope', filters.scope);
    }

    setIsLoading(true);
    setError(null);

    fetch(`/api/creative-patterns?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { docs?: ICreativePattern[] }) => {
        setPatterns(data.docs ?? []);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load patterns';
        logger.error('usePatternContext: fetch failed', { error: err });
        setError(message);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [filters?.platform, filters?.patternType, filters?.scope]);

  return { error, isLoading, patterns };
}

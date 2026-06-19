'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import { useCallback, useRef, useState } from 'react';
import type {
  FastlaneFormat,
  FastlaneIdea,
  UseFastlaneIdeasReturn,
} from '../types';

export function useFastlaneIdeas(brandId: string): UseFastlaneIdeasReturn {
  const [ideas, setIdeas] = useState<FastlaneIdea[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const controllerRef = useRef<AbortController | null>(null);

  const generateIdeas = useCallback(
    async (
      formats: FastlaneFormat[],
      count: number,
      angle?: string,
    ): Promise<void> => {
      // Cancel any in-flight request
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setIsLoading(true);
      setError(null);
      setIdeas([]);

      try {
        const service = await getBrandsService();
        const result = await service.generateFastlaneIdeas(brandId, {
          formats,
          count,
          angle,
        });

        if (!controller.signal.aborted) {
          setIdeas(result);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        logger.error('Fastlane: failed to generate ideas', err);

        // Surface 400 (brand voice not configured) as a user-readable message
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to generate ideas. Check that your brand voice is configured.';

        setError(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [brandId, getBrandsService],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setIdeas([]);
    setIsLoading(false);
    setError(null);
  }, []);

  return { ideas, isLoading, error, generateIdeas, reset };
}

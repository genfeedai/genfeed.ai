'use client';

import {
  TrendsService,
  type TrendVideoPlaybackResult,
} from '@genfeedai/services/social/trends.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback } from 'react';

/**
 * Asks the server for a playable copy of a TikTok or Instagram trend video.
 * Resolves to what the player shows next: the copy, an upgrade prompt, or
 * "cannot be played here".
 */
export function useTrendVideoPlayback() {
  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  return useCallback(
    async (videoId: string): Promise<TrendVideoPlaybackResult> => {
      try {
        const service = await getTrendsService();
        return await service.getVideoPlayback(videoId);
      } catch {
        return { status: 'unavailable' };
      }
    },
    [getTrendsService],
  );
}

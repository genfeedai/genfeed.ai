'use client';

import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@genfeedai/services/core/logger.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { useEffect, useState } from 'react';

export interface VideoUpscaleQuoteRequest {
  isEnabled: boolean;
  model: string;
  targetFps: number;
  targetResolution: string;
  videoId: string;
}

export interface VideoUpscaleQuoteState {
  /** The server's price for these options; null until it has answered. */
  credits: number | null;
  /** True when the read failed, so the options could not be priced. */
  isFailed: boolean;
}

interface QuoteSnapshot extends VideoUpscaleQuoteState {
  key: string;
}

const UNPRICED: VideoUpscaleQuoteState = { credits: null, isFailed: false };

/**
 * What an upscale of this video costs at the chosen model, resolution and
 * frame rate, read from the API so the figure matches the charge. A price for
 * other options or another video is never shown for the current ones, and a
 * change aborts the request in flight.
 */
export function useVideoUpscaleQuote({
  isEnabled,
  model,
  targetFps,
  targetResolution,
  videoId,
}: VideoUpscaleQuoteRequest): VideoUpscaleQuoteState {
  const getVideosService = useAuthedService((token) =>
    VideosService.getInstance(token),
  );
  const [snapshot, setSnapshot] = useState<QuoteSnapshot | null>(null);
  const key = [videoId, model, targetFps, targetResolution].join('\u0001');

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const service = await getVideosService();
        const quote = await service.findUpscaleQuote(
          videoId,
          { model, targetFps, targetResolution },
          controller.signal,
        );

        if (!controller.signal.aborted) {
          setSnapshot({ credits: quote.credits, isFailed: false, key });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error(`GET /videos/${videoId}/upscale-quote failed`, error);
        setSnapshot({ credits: null, isFailed: true, key });
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [
    getVideosService,
    isEnabled,
    key,
    model,
    targetFps,
    targetResolution,
    videoId,
  ]);

  if (!isEnabled || snapshot?.key !== key) {
    return UNPRICED;
  }
  return { credits: snapshot.credits, isFailed: snapshot.isFailed };
}

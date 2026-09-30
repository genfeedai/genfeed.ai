'use client';

import type { Image } from '@genfeedai/models/ingredients/image.model';
import type { Video } from '@genfeedai/models/ingredients/video.model';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useEffect, useState } from 'react';

export type StoryboardAssetRequest = { id: string; kind: 'image' | 'video' };
export type StoryboardAsset = Image | Video;
export const storyboardAssetKey = (request: StoryboardAssetRequest) =>
  `${request.kind}:${request.id}`;

export function useStoryboardAssets(
  scope: string,
  brandId: string,
  requests: StoryboardAssetRequest[],
) {
  const getImages = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );
  const getVideos = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );
  const requestKey = JSON.stringify(
    [
      ...new Map(
        requests.map((request) => [storyboardAssetKey(request), request]),
      ).values(),
    ].sort((a, b) =>
      storyboardAssetKey(a).localeCompare(storyboardAssetKey(b)),
    ),
  );
  const key = `${scope}:${brandId}:${requestKey}`;
  const [result, setResult] = useState<{
    key: string;
    assets: Record<string, StoryboardAsset>;
  }>({ key: '', assets: {} });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, assets: {} });
    const load = async () => {
      const requested: StoryboardAssetRequest[] = JSON.parse(requestKey);
      if (!requested.length) return;
      try {
        const [images, videos] = await Promise.all([getImages(), getVideos()]);
        await Promise.all(
          requested.map(async (request) => {
            try {
              const asset = await (request.kind === 'image'
                ? images
                : videos
              ).findOne(
                request.id,
                { brandId, isDeleted: false },
                controller.signal,
              );
              if (
                controller.signal.aborted ||
                asset.brandId !== brandId ||
                asset.isDeleted
              )
                return;
              setResult((current) =>
                current.key === key
                  ? {
                      key,
                      assets: {
                        ...current.assets,
                        [storyboardAssetKey(request)]: asset,
                      },
                    }
                  : current,
              );
            } catch {
              /* Unavailable assets deliberately stay absent. */
            }
          }),
        );
      } catch {
        /* Missing authentication deliberately leaves previews unavailable. */
      }
    };
    void load();
    return () => controller.abort();
  }, [key, requestKey, brandId, getImages, getVideos]);
  return result.key === key ? result.assets : {};
}

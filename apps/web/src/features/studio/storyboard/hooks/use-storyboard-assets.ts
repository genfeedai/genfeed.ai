'use client';

import type { Image } from '@genfeedai/models/ingredients/image.model';
import type { Video } from '@genfeedai/models/ingredients/video.model';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useMemo } from 'react';
import { useAuthorizedMediaUrls } from '@/features/studio/hooks/use-authorized-media-urls';

export type StoryboardAssetRequest = { id: string; kind: 'image' | 'video' };
export type StoryboardAsset = Image | Video;
const EMPTY_ASSETS: Record<string, StoryboardAsset> = {};
export const storyboardAssetKey = (request: StoryboardAssetRequest) =>
  `${request.kind}:${request.id}`;

interface StoryboardAssetServices {
  images: ImagesService;
  videos: VideosService;
}

function createStoryboardAssetServices(token: string): StoryboardAssetServices {
  return {
    images: ImagesService.getInstance(token),
    videos: VideosService.getInstance(token),
  };
}

/**
 * The brand's assets a storyboard shows, keyed by `storyboardAssetKey`.
 *
 * Cached per brand, storyboard scope (run and revision) and asset set, so
 * reopening a storyboard paints its previews at once while they refresh in the
 * background. A new scope or asset set never shows another one's assets.
 * Denied, deleted and cross-brand assets deliberately stay absent.
 */
export function useStoryboardAssets(
  scope: string,
  brandId: string,
  requests: StoryboardAssetRequest[],
) {
  const requested = [
    ...new Map(
      requests.map((request) => [storyboardAssetKey(request), request]),
    ).values(),
  ].sort((a, b) => storyboardAssetKey(a).localeCompare(storyboardAssetKey(b)));
  const requestedKeys = requested.map(storyboardAssetKey);
  const { data } = useAuthedQuery<
    StoryboardAssetServices,
    Record<string, StoryboardAsset>
  >({
    enabled: Boolean(brandId) && requested.length > 0,
    queryFn: async ({ images, videos }, signal) => {
      const loaded = await Promise.all(
        requested.map(async (request) => {
          try {
            const asset = await (request.kind === 'image'
              ? images
              : videos
            ).findOne(request.id, { brandId, isDeleted: false }, signal);
            return asset.brandId === brandId && !asset.isDeleted
              ? ([storyboardAssetKey(request), asset] as const)
              : null;
          } catch {
            /* Unavailable assets deliberately stay absent. */
            return null;
          }
        }),
      );
      return Object.fromEntries(
        loaded.filter(
          (entry): entry is readonly [string, StoryboardAsset] =>
            entry !== null,
        ),
      );
    },
    queryKey: ['storyboard-assets', brandId, scope, requestedKeys],
    service: createStoryboardAssetServices,
  });
  const loaded = requested.length > 0 && data ? data : EMPTY_ASSETS;
  const urls = useAuthorizedMediaUrls(loaded);
  // The API signs each preview, so `cdnUrl` is only usable once its grant is
  // ready and must be refreshed before it expires.
  return useMemo(
    () =>
      Object.fromEntries(
        Object.entries(loaded).map(([assetKey, asset]) => [
          assetKey,
          Object.assign(Object.create(Object.getPrototypeOf(asset)), asset, {
            cdnUrl: urls[assetKey] ?? null,
          }) as StoryboardAsset,
        ]),
      ),
    [loaded, urls],
  );
}

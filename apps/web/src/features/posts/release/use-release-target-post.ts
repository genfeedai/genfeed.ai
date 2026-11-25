import type { IPost, IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useMemo, useState } from 'react';
import { buildPostMedia } from '@/features/posts/detail/post-detail-preview.helpers';

/**
 * Loads the post behind a release target. The release row carries no media
 * URLs and no connected-account details, so every preview that wants to draw
 * the real slides and the real account reads them from the post itself.
 */
export function useReleaseTargetPost(
  targetId: string | undefined,
): IPost | null {
  const { getToken } = useAuthIdentity();
  const [post, setPost] = useState<IPost | null>(null);

  // use-effect-audit: ignore abortable request
  useEffect(() => {
    if (!targetId) {
      setPost(null);
      return;
    }

    const controller = new AbortController();

    async function loadPost(id: string) {
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        const loaded = await PostsService.getInstance(token).findOne(id);
        if (!controller.signal.aborted) {
          setPost(loaded);
        }
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load release target post', fetchError);
        }
      }
    }

    void loadPost(targetId);
    return () => controller.abort();
  }, [getToken, targetId]);

  return post;
}

/**
 * The release with its media drawn from the post. A release row stores media
 * as references (asset id, kind, order) and never a URL, so its slides would
 * paint as empty "Image" tiles. Each reference takes its URL from the post's
 * hydrated ingredient with the same asset id, and a release with no references
 * at all (a backfilled or imported post that never went through a release
 * group) takes the post's slides whole.
 */
export function useReleaseWithPostMedia(
  release: IReleaseGroup,
  post: IPost | null,
): IReleaseGroup {
  return useMemo(() => {
    if (!post) {
      return release;
    }
    const postMedia = buildPostMedia(post);
    if ((release.media ?? []).length === 0) {
      return { ...release, media: postMedia };
    }
    const postMediaByAssetId = new Map(
      postMedia.map((item) => [item.assetId, item]),
    );
    return {
      ...release,
      media: release.media.map((item) => {
        if (item.url) {
          return item;
        }
        const fromPost = postMediaByAssetId.get(item.assetId);
        return fromPost?.url
          ? { ...item, kind: item.kind ?? fromPost.kind, url: fromPost.url }
          : item;
      }),
    };
  }, [post, release]);
}

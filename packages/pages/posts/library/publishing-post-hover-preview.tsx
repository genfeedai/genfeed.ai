'use client';

import type { IPost, IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers';
import type { TargetPreviewCredential } from '@genfeedai/props/ui/previews.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { PostsService } from '@services/content/posts.service';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import type { PlatformPreviewTarget } from '@ui/posts/platform-preview/PlatformPreview.types';
import { buildTargetPreview } from '@ui/previews/preview.helpers';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@ui/primitives/hover-card';
import { type ReactNode, useEffect, useState } from 'react';

function LoadedPostPreview({
  postId,
  fallback,
}: {
  postId: string;
  fallback?: PlatformPreviewTarget;
}) {
  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );
  const [post, setPost] = useState<IPost | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPost(null);
    setIsError(false);
    void (async () => {
      try {
        const service = await getPostsService();
        if (controller.signal.aborted) return;
        const result = await service.findOne(postId, {}, controller.signal);
        if (!controller.signal.aborted) setPost(result);
      } catch {
        if (!controller.signal.aborted) setIsError(true);
      }
    })();
    return () => controller.abort();
  }, [getPostsService, postId]);

  return (
    <>
      {!post ? (
        <p className="mb-2 text-xs text-muted-foreground" role="status">
          {isError
            ? 'Full post preview unavailable. Open the post to review it.'
            : 'Loading post preview…'}
        </p>
      ) : null}
      {post ? (
        <PlatformPreview post={post} />
      ) : fallback ? (
        <PlatformPreview target={fallback} />
      ) : null}
    </>
  );
}

type PublishingHoverPreview =
  | { kind: 'post'; post: IPost }
  | { kind: 'targets'; targets: PlatformPreviewTarget[] };

function credentialForTarget(
  target: NonNullable<IReleaseGroup['targets']>[number],
): TargetPreviewCredential {
  return (
    target.credential ?? {
      externalAvatar: null,
      externalHandle: null,
      externalName: null,
      label: '',
      platform: target.platform,
    }
  );
}

function targetsFromRelease(release: IReleaseGroup): PlatformPreviewTarget[] {
  const targets = release.targets ?? [];

  if (targets.length === 0) {
    return [
      {
        caption: release.baseContent ?? '',
        id: release.id,
        media: [...(release.media ?? [])]
          .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
          .map((item) => ({
            id: item.assetId,
            isAnimated: item.kind === 'gif',
            kind:
              item.kind === 'video' || item.kind === 'short_video'
                ? item.kind
                : 'image',
            url: item.url || undefined,
          })),
        platform: 'social',
        title: release.title,
      },
    ];
  }

  return targets.map((target) =>
    buildTargetPreview({
      credential: credentialForTarget(target),
      release,
      target,
    }),
  );
}

export function resolvePublishingHoverPreview({
  post,
  release,
}: {
  post?: IPost | null;
  release?: IReleaseGroup | null;
}): PublishingHoverPreview | null {
  if (release && (release.baseContent || (release.targets?.length ?? 0) > 0)) {
    const targets = targetsFromRelease(release).filter(
      (target) =>
        target.caption.trim().length > 0 ||
        target.title?.trim() ||
        (target.media?.length ?? 0) > 0,
    );
    return targets.length > 0 ? { kind: 'targets', targets } : null;
  }

  if (post && (post.description?.trim() || post.label?.trim())) {
    return { kind: 'post', post };
  }

  return null;
}

export default function PublishingPostHoverPreview({
  children,
  className,
  post,
  postId,
  release,
  target,
}: {
  children: ReactNode;
  className?: string;
  post?: IPost | null;
  postId?: string;
  release?: IReleaseGroup | null;
  target?: PlatformPreviewTarget;
}) {
  const preview = resolvePublishingHoverPreview({ post, release });

  if (!preview && !postId && !target) {
    return children;
  }

  return (
    <HoverCard openDelay={280} closeDelay={200}>
      <HoverCardTrigger asChild>
        <div className={cn('min-w-0', className)}>{children}</div>
      </HoverCardTrigger>
      <HoverCardContent>
        {postId && !post ? (
          <LoadedPostPreview key={postId} postId={postId} fallback={target} />
        ) : preview?.kind === 'post' ? (
          <PlatformPreview post={preview.post} />
        ) : preview?.kind === 'targets' ? (
          <PlatformPreview targets={preview.targets} />
        ) : target ? (
          <PlatformPreview target={target} />
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

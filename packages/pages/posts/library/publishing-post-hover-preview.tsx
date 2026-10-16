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
import { type ReactNode, useEffect, useRef, useState } from 'react';

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
        <PlatformPreview presentation="compact" post={post} />
      ) : fallback ? (
        <PlatformPreview presentation="compact" target={fallback} />
      ) : null}
    </>
  );
}

/** Room a full preview wants; below this the card opens on the roomier side. */
const PREVIEW_ROOM_PX = 440;

type PreviewSide = 'bottom' | 'top';

/**
 * Picked once, when the card opens. Letting the card choose by itself is what
 * made it jump: it opened below with the small loading placeholder, grew when
 * the full post arrived, ran out of room and flipped above mid-view.
 */
function pickPreviewSide(trigger: HTMLElement | null): PreviewSide {
  if (!trigger || typeof window === 'undefined') {
    return 'bottom';
  }
  const { bottom, top } = trigger.getBoundingClientRect();
  const roomBelow = window.innerHeight - bottom;
  return roomBelow >= PREVIEW_ROOM_PX || roomBelow >= top ? 'bottom' : 'top';
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
  const triggerRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<PreviewSide>('bottom');
  const [isOpen, setIsOpen] = useState(false);

  if (!preview && !postId && !target) {
    return children;
  }

  return (
    <HoverCard
      open={isOpen}
      closeDelay={120}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setSide(pickPreviewSide(triggerRef.current));
        }
        setIsOpen(isOpen);
      }}
      openDelay={180}
    >
      <HoverCardTrigger asChild>
        <div className={cn('min-w-0', className)} ref={triggerRef}>
          {children}
        </div>
      </HoverCardTrigger>
      {/* The trigger is usually a full-width list row, so the default right
          side has no room, flips left and lands on top of the sidebar. Open
          above or below it, on whichever side has more room, and cap the card
          to that room so it scrolls instead of being cut off. No flipping:
          the side is already the roomy one. A plain fade, because a scale or
          slide moves the card while it is still being measured. */}
      <HoverCardContent
        align="start"
        avoidCollisions={false}
        collisionPadding={12}
        className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[min(28rem,calc(var(--radix-hover-card-content-available-height)-0.5rem))] overscroll-contain duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        side={side}
      >
        {postId && !post ? (
          <LoadedPostPreview key={postId} postId={postId} fallback={target} />
        ) : preview?.kind === 'post' ? (
          <PlatformPreview presentation="compact" post={preview.post} />
        ) : preview?.kind === 'targets' ? (
          <PlatformPreview presentation="compact" targets={preview.targets} />
        ) : target ? (
          <PlatformPreview presentation="compact" target={target} />
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

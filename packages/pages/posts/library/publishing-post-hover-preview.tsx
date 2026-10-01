'use client';

import type { IPost, IReleaseGroup } from '@genfeedai/contracts/interfaces';
import type { TargetPreviewCredential } from '@genfeedai/props/ui/previews.props';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import type { PlatformPreviewTarget } from '@ui/posts/platform-preview/PlatformPreview.types';
import { buildTargetPreview } from '@ui/previews/preview.helpers';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@ui/primitives/hover-card';
import type { ReactNode } from 'react';

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
        caption: release.baseContent,
        id: release.id,
        media: [...release.media]
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
      (target) => target.caption.trim().length > 0 || target.title?.trim(),
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
  post,
  release,
}: {
  children: ReactNode;
  post?: IPost | null;
  release?: IReleaseGroup | null;
}) {
  const preview = resolvePublishingHoverPreview({ post, release });

  if (!preview) {
    return children;
  }

  return (
    <HoverCard openDelay={280} closeDelay={200}>
      <HoverCardTrigger asChild>
        <div className="min-w-0">{children}</div>
      </HoverCardTrigger>
      <HoverCardContent>
        {preview.kind === 'post' ? (
          <PlatformPreview post={preview.post} />
        ) : (
          <PlatformPreview targets={preview.targets} />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

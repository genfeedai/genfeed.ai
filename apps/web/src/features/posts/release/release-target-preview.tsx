'use client';

import {
  CredentialPlatform,
  type TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IPost,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { Badge } from '@ui/primitives/badge';
import { useMemo } from 'react';
import TargetPreview from '@/components/previews/TargetPreview';
import ThreadPreviewPanel from '@/features/posts/components/posts/preview/thread-preview-panel/ThreadPreviewPanel';
import {
  badgeVariantForTone,
  targetStateBadge,
} from '@/features/posts/shared/release-status.helpers';
import {
  useReleaseTargetPost,
  useReleaseWithPostMedia,
} from './use-release-target-post';

interface ReleaseTargetPreviewProps {
  release: IReleaseGroup;
  target: IChannelTarget;
}

function replyStatus(post: {
  targetError?: IPost['targetError'];
  targetExecutionState?: IPost['targetExecutionState'];
}) {
  if (!post.targetExecutionState) {
    return null;
  }
  const badge = targetStateBadge(
    post.targetExecutionState as TargetExecutionState,
  );
  return (
    <>
      {post.targetError?.message ? (
        <span className="mr-auto truncate text-xs text-destructive">
          {post.targetError.message}
        </span>
      ) : null}
      <Badge variant={badgeVariantForTone(badge.tone)}>{badge.label}</Badge>
    </>
  );
}

/**
 * What a release target will post, or posted. An X target with replies is a
 * thread, shown post by post with where each one stands in publishing; every
 * other target keeps the single platform preview.
 *
 * The release row carries no media URLs and, for a post that never went
 * through a release group (a backfilled or imported post), no media at all.
 * The target's own post does, so the preview loads it and draws the slides and
 * the connected account from there instead of showing "Media required" and a
 * placeholder account.
 */
export default function ReleaseTargetPreview({
  release,
  target,
}: ReleaseTargetPreviewProps): React.JSX.Element {
  const post = useReleaseTargetPost(target.id);
  const previewRelease = useReleaseWithPostMedia(release, post);

  const replies = useMemo(
    () =>
      target.platform === CredentialPlatform.TWITTER
        ? [...(post?.children ?? [])].sort(
            (a, b) => (a.order ?? 0) - (b.order ?? 0),
          )
        : [],
    [post, target.platform],
  );

  if (!post || replies.length === 0) {
    return (
      <TargetPreview
        credential={
          target.credential ?? post?.credential ?? { platform: target.platform }
        }
        release={previewRelease}
        target={target}
      />
    );
  }

  return (
    <ThreadPreviewPanel
      parent={{
        content: post.description ?? '',
        id: post.id,
        status: replyStatus({
          targetError: target.error,
          targetExecutionState: target.executionState,
        }),
      }}
      replies={replies.map((reply) => ({
        content: reply.description ?? '',
        id: reply.id,
        status: replyStatus(reply),
      }))}
    />
  );
}

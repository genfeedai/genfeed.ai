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
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  badgeVariantForTone,
  targetStateBadge,
} from '@pages/posts/shared/release-status.helpers';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import ThreadPreviewPanel from '@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel';
import TargetPreview from '@ui/previews/TargetPreview';
import { Badge } from '@ui/primitives/badge';
import { useEffect, useMemo, useState } from 'react';

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
 */
export default function ReleaseTargetPreview({
  release,
  target,
}: ReleaseTargetPreviewProps): React.JSX.Element {
  const { getToken } = useAuthIdentity();
  const [thread, setThread] = useState<IPost | null>(null);
  const isThreadPlatform = target.platform === CredentialPlatform.TWITTER;

  useEffect(() => {
    if (!isThreadPlatform) {
      return;
    }
    const controller = new AbortController();

    async function loadThread() {
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        const post = await PostsService.getInstance(token).findOne(target.id);
        if (!controller.signal.aborted) {
          setThread(post);
        }
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load release target thread', fetchError);
        }
      }
    }

    void loadThread();
    return () => controller.abort();
  }, [getToken, isThreadPlatform, target.id]);

  const replies = useMemo(
    () =>
      [...(thread?.children ?? [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      ),
    [thread],
  );

  if (!thread || replies.length === 0) {
    return (
      <TargetPreview
        className="max-w-sm"
        credential={target.credential ?? { platform: target.platform }}
        release={release}
        target={target}
      />
    );
  }

  return (
    <ThreadPreviewPanel
      parent={{
        content: thread.description ?? '',
        id: thread.id,
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

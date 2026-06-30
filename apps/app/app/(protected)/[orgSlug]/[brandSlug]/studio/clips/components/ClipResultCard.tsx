'use client';

import { COMPOSE_ROUTES } from '@genfeedai/constants';
import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  ClipReadyAction,
  ClipResult,
  ClipStatus,
  ViralityBadgeProps,
} from '@props/studio/clips.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import {
  HiOutlineArrowDownTray,
  HiOutlinePencilSquare,
  HiOutlineRocketLaunch,
} from 'react-icons/hi2';
import type { ClipsApiService } from '../services/clips-api.service';

interface ClipResultCardProps {
  clip: ClipResult;
  clipsService: ClipsApiService;
  projectId: string;
}

const STATUS_CONFIG: Record<ClipStatus, { label: string; color: string }> = {
  captioning: {
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    label: 'Captioning',
  },
  completed: {
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    label: 'Ready',
  },
  extracting: {
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    label: 'Generating',
  },
  failed: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'Failed',
  },
  pending: {
    color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    label: 'Queued',
  },
};

function ViralityBadge({ score }: ViralityBadgeProps) {
  let color = 'text-zinc-400';
  if (score >= 80) color = 'text-green-400';
  else if (score >= 60) color = 'text-yellow-400';
  else if (score >= 40) color = 'text-orange-400';

  return (
    <span className={`font-mono text-xs ${color}`} title="Virality score">
      {score}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function ClipResultCard({
  clip,
  clipsService,
  projectId,
}: ClipResultCardProps) {
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const statusConfig = STATUS_CONFIG[clip.status] || STATUS_CONFIG.pending;
  const videoUrl = clip.captionedVideoUrl || clip.videoUrl;
  const canUseAction = useCallback(
    (action: ClipReadyAction) => {
      const readyActions = clip.readiness?.readyActions;

      if (readyActions && readyActions.length > 0) {
        return readyActions.includes(action);
      }

      return clip.status === 'completed';
    },
    [clip.readiness?.readyActions, clip.status],
  );
  const canEdit = Boolean(videoUrl && canUseAction('edit'));
  const canPublish = Boolean(videoUrl && canUseAction('publish'));
  const canDownload = Boolean(videoUrl && canUseAction('download'));
  const hasReadyAction = canEdit || canPublish || canDownload;

  const handleEdit = useCallback(async () => {
    if (!videoUrl) return;

    try {
      const handoff = await clipsService.createEditorHandoff(
        projectId,
        clip._id,
      );

      push(href(handoff.editorPath));
    } catch {
      push(href('/editor'));
    }
  }, [clip._id, projectId, videoUrl, clipsService, href, push]);

  const handlePublish = useCallback(async () => {
    const handoff = await clipsService.createPublishHandoff(
      projectId,
      clip._id,
    );
    const asset = handoff.payload.assets[0];
    const title = handoff.payload.metadata?.title ?? clip.title;
    const description =
      handoff.payload.metadata?.summary ?? asset?.caption ?? clip.summary;
    const params = new URLSearchParams({
      clipProjectId: projectId,
      clipResultId: handoff.payload.metadata?.clipResultId ?? clip._id,
      description,
      mediaUrl: asset?.mediaUrl ?? videoUrl ?? '',
      title,
    });
    push(`${href(COMPOSE_ROUTES.POST)}?${params.toString()}`);
  }, [
    clip._id,
    clip.summary,
    clip.title,
    projectId,
    videoUrl,
    clipsService,
    href,
    push,
  ]);

  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
    link.target = '_blank';
    link.click();
  }, [videoUrl, clip.title]);

  return (
    <div className="group relative flex flex-col rounded-card border border-zinc-800 bg-zinc-900/50 p-4 transition-all hover:border-zinc-700 hover:bg-zinc-900">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusConfig.color}`}
          >
            {statusConfig.label}
          </Badge>
          {clip.clipType && (
            <Badge
              variant="secondary"
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500"
            >
              {clip.clipType}
            </Badge>
          )}
        </div>
        <ViralityBadge score={clip.viralityScore} />
      </div>

      {/* Title & Summary */}
      <h3 className="mb-1 line-clamp-2 text-sm font-medium text-zinc-100">
        {clip.title}
      </h3>
      <p className="mb-3 line-clamp-2 text-xs text-zinc-500">{clip.summary}</p>

      {/* Metadata */}
      <div className="mb-3 flex items-center gap-3 text-[10px] text-zinc-600">
        <span>{formatDuration(clip.duration)}</span>
        <span>
          {formatDuration(clip.startTime)} → {formatDuration(clip.endTime)}
        </span>
      </div>

      {/* Tags */}
      {clip.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {clip.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="rounded bg-zinc-800/50 px-1.5 py-0.5 text-[10px] text-zinc-500"
            >
              #{tag}
            </Badge>
          ))}
          {clip.tags.length > 3 && (
            <span className="text-[10px] text-zinc-600">
              +{clip.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Actions -- visible when ready */}
      {hasReadyAction && videoUrl && (
        <div className="mt-auto flex gap-2 pt-2">
          {canEdit && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
              onClick={handleEdit}
              title="Edit in video editor"
            >
              <HiOutlinePencilSquare className="size-3.5" />
              <span>Edit</span>
            </Button>
          )}
          {canPublish && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary"
              onClick={handlePublish}
              title="Publish to social platforms"
            >
              <HiOutlineRocketLaunch className="size-3.5" />
              <span>Publish</span>
            </Button>
          )}
          {canDownload && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              className="flex items-center justify-center rounded-lg bg-zinc-800 px-2.5 py-2 text-zinc-300 hover:bg-zinc-700"
              onClick={handleDownload}
              aria-label="Download video"
              title="Download video"
            >
              <HiOutlineArrowDownTray className="size-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Processing indicator */}
      {!hasReadyAction && clip.status !== 'failed' && (
        <div className="mt-auto flex items-center justify-center pt-3">
          <Spinner size={ComponentSize.SM} className="text-primary/50" />
        </div>
      )}

      {/* Failed state */}
      {clip.status === 'failed' && (
        <div className="mt-auto pt-2">
          <p className="text-xs text-red-400/70">
            Generation failed. The clip will be retried automatically.
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { buildClipDraftAgentHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { downloadUrl } from '@helpers/media/download/download.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  ClipLibraryLinkStatus,
  ClipReadyAction,
  ClipResult,
  ClipResultMode,
  ClipStatus,
  ViralityBadgeProps,
} from '@props/studio/clips.props';
import Card from '@ui/card/Card';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Download, Library, Rocket, SquarePen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import type { ClipsApiService } from '../services/clips-api.service';

interface ClipResultCardProps {
  clip: ClipResult;
  clipsService: ClipsApiService;
  mode?: ClipResultMode;
  projectId: string;
}

const STATUS_CONFIG: Record<ClipStatus, { label?: string; color: string }> = {
  captioning: {
    color: 'bg-info/10 text-info border-transparent',
    label: 'Captioning',
  },
  completed: {
    color: 'bg-success/10 text-success border-transparent',
    label: 'Ready',
  },
  degraded: {
    color: 'bg-warning/10 text-warning border-transparent',
  },
  extracting: {
    color: 'bg-warning/10 text-warning border-transparent',
    label: 'Generating',
  },
  failed: {
    color: 'bg-destructive/10 text-destructive border-transparent',
    label: 'Failed',
  },
  pending: {
    color: 'bg-secondary text-muted-foreground border-transparent',
    label: 'Queued',
  },
  reframing: {
    color: 'bg-info/10 text-info border-transparent',
    label: 'Framing',
  },
  validating: {
    color: 'bg-info/10 text-info border-transparent',
    label: 'Validating',
  },
};

function ViralityBadge({ score }: ViralityBadgeProps) {
  let color = 'text-muted-foreground';
  if (score >= 80) color = 'text-success';
  else if (score >= 60) color = 'text-warning';
  else if (score >= 40) color = 'text-warning';

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
  mode,
  projectId,
}: ClipResultCardProps) {
  const t = useTranslations('pages.studioClips');
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const [retryLink, setRetryLink] = useState<{
    error?: string;
    ingredientId?: string;
    status?: ClipLibraryLinkStatus;
  } | null>(null);
  const libraryLink = {
    error: retryLink?.error ?? clip.libraryLinkError,
    ingredientId: retryLink?.ingredientId ?? clip.ingredientId,
    status: retryLink?.status ?? clip.libraryLinkStatus,
  };
  const statusConfig = STATUS_CONFIG[clip.status] || STATUS_CONFIG.pending;
  const videoUrl = clip.captionedVideoUrl || clip.videoUrl;
  const isInLibrary =
    libraryLink.status === 'linked' && Boolean(libraryLink.ingredientId);
  const canRetryLibraryLink =
    clip.status === 'completed' &&
    Boolean(videoUrl) &&
    libraryLink.status === 'failed';
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
        clip.id,
      );

      push(href(handoff.editorPath));
    } catch {
      push(href(APP_ROUTES.STUDIO.EDIT));
    }
  }, [clip.id, projectId, videoUrl, clipsService, href, push]);

  const handlePublish = useCallback(async () => {
    const handoff = await clipsService.createPublishHandoff(projectId, clip.id);
    const asset = handoff.payload.assets[0];
    const title = handoff.payload.metadata?.title ?? clip.title;
    const description =
      handoff.payload.metadata?.summary ?? asset?.caption ?? clip.summary;
    push(
      href(
        buildClipDraftAgentHref({
          description,
          ingredientId:
            handoff.payload.metadata?.ingredientId ??
            libraryLink.ingredientId ??
            undefined,
          mediaUrl: asset?.mediaUrl ?? videoUrl ?? undefined,
          title,
        }),
      ),
    );
  }, [
    clip.id,
    clip.summary,
    clip.title,
    libraryLink.ingredientId,
    projectId,
    videoUrl,
    clipsService,
    href,
    push,
  ]);

  const handleRetryLibraryLink = useCallback(async () => {
    const result = await clipsService.retryLibraryLink(projectId, clip.id);
    setRetryLink({
      error: result.error,
      ingredientId: result.ingredientId,
      status: result.status,
    });
  }, [clip.id, clipsService, projectId]);

  const handleDownload = useCallback(async () => {
    if (!videoUrl) return;

    await downloadUrl(
      videoUrl,
      `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`,
    );
  }, [videoUrl, clip.title]);

  return (
    <Card
      className="group h-full transition-colors hover:bg-background-secondary"
      bodyClassName="h-full gap-0 p-4"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`rounded-full px-2 py-0.5 text-2xs font-medium uppercase tracking-wider ${statusConfig.color}`}
          >
            {statusConfig.label ?? t('reviewRequired')}
          </Badge>
          {clip.clipType && (
            <Badge
              variant="secondary"
              className="rounded bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground"
            >
              {clip.clipType}
            </Badge>
          )}
          <Badge
            variant="secondary"
            className="rounded bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground"
          >
            {(clip.mode ?? mode ?? 'avatar') === 'raw-cut'
              ? 'Raw cut'
              : 'AI avatar'}
          </Badge>
          {isInLibrary && (
            <Badge
              variant="secondary"
              className="rounded bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground"
            >
              {t('inLibrary')}
            </Badge>
          )}
        </div>
        <ViralityBadge score={clip.viralityScore} />
      </div>

      {clip.status === 'completed' && videoUrl && (
        <div
          className={
            'mb-3 aspect-video overflow-hidden rounded-lg bg-black' // design-system-allow-content-color
          }
        >
          <VideoPlayer
            ariaLabel={`Preview ${clip.title}`}
            src={videoUrl}
            className={'bg-black' /* design-system-allow-content-color */}
            config={{
              autoPlay: false,
              controls: true,
              loop: false,
              muted: false,
              playsInline: true,
              preload: 'metadata',
            }}
          />
        </div>
      )}

      {/* Title & Summary */}
      <h3 className="mb-1 line-clamp-2 text-sm font-medium text-foreground">
        {clip.title}
      </h3>
      <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
        {clip.summary}
      </p>

      {/* Metadata */}
      <div className="mb-3 flex items-center gap-3 text-2xs text-muted-foreground/80">
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
              className="rounded bg-secondary/50 px-1.5 py-0.5 text-2xs text-muted-foreground"
            >
              #{tag}
            </Badge>
          ))}
          {clip.tags.length > 3 && (
            <span className="text-2xs text-muted-foreground/80">
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
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent sm:min-h-8"
              onClick={handleEdit}
              title="Edit in Studio"
            >
              <SquarePen className="size-3.5" />
              <span>{t('edit')}</span>
            </Button>
          )}
          {canPublish && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:min-h-8"
              onClick={handlePublish}
              title="Publish to social platforms"
            >
              <Rocket className="size-3.5" />
              <span>{t('publish')}</span>
            </Button>
          )}
          {canDownload && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-secondary px-2.5 py-2 text-secondary-foreground transition-colors hover:bg-accent sm:min-h-8 sm:min-w-8"
              onClick={handleDownload}
              aria-label="Download video"
              title="Download video"
            >
              <Download className="size-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Processing indicator */}
      {!hasReadyAction &&
        clip.status !== 'failed' &&
        clip.status !== 'degraded' && (
          <div className="mt-auto flex items-center justify-center pt-3">
            <Spinner size={ComponentSize.SM} className="text-primary/50" />
          </div>
        )}

      {canRetryLibraryLink && (
        <div className="mt-2">
          <Button
            variant={ButtonVariant.UNSTYLED}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent sm:min-h-8"
            onClick={handleRetryLibraryLink}
            title="Retry saving this clip to Library"
          >
            <Library className="size-3.5" />
            <span>{t('retryLibraryLink')}</span>
          </Button>
          {libraryLink.error && (
            <p className="mt-1 text-xs text-destructive/70">
              {libraryLink.error}
            </p>
          )}
        </div>
      )}

      {/* Failed state */}
      {clip.status === 'failed' && (
        <div className="mt-auto pt-2">
          <p className="text-xs text-destructive/70">{t('generationFailed')}</p>
        </div>
      )}
      {clip.status === 'degraded' && (
        <div className="mt-auto pt-2">
          <p className="text-xs font-medium text-warning">
            {t('reviewRequired')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {clip.mediaValidation?.issues.join(' ') ??
              t('mediaReadinessFailed')}
          </p>
        </div>
      )}
    </Card>
  );
}

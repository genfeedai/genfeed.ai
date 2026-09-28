import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import type { ClipsProjectCardProps } from '@props/studio/clips.props';
import Card from '@ui/card/Card';
import { Film } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { youtubeThumbnailUrl } from '../utils/youtube-thumbnail';

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

export default function ClipsProjectCard({
  href,
  project,
  actions,
}: ClipsProjectCardProps) {
  const t = useTranslations('pages.studioClips');
  const thumbnailUrl = youtubeThumbnailUrl(project.sourceVideoUrl);

  return (
    <Card className="h-full" data-testid="clips-project-card">
      <div className="relative mb-3 aspect-video overflow-hidden bg-background-secondary">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={project.name}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 360px"
            className="object-cover outline-media"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Film className="size-8" />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="truncate text-sm font-medium text-foreground">
          <Link href={href}>{project.name}</Link>
        </h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {project.isDraft ? (
            <span className="font-medium text-foreground">
              {t('draftBadge')}
            </span>
          ) : (
            <>
              {t('clipsCount', { count: project.readyClipCount })}
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {statusLabel(project.status)}
            </>
          )}
          {(project.updatedAt ?? project.createdAt) ? (
            <>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {getRelativeTime(project.updatedAt ?? project.createdAt ?? '')}
            </>
          ) : null}
        </p>
      </div>
      {actions}
    </Card>
  );
}

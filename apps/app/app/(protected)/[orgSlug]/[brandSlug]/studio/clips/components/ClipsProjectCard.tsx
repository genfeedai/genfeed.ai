'use client';

import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import type { ClipsProjectCardProps } from '@props/studio/clips.props';
import Card from '@ui/card/Card';
import { Film } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { youtubeThumbnailUrl } from '../utils/youtube-thumbnail';

function clipCountLabel(count: number): string {
  return `${count} clip${count === 1 ? '' : 's'}`;
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

export default function ClipsProjectCard({
  href,
  project,
}: ClipsProjectCardProps) {
  const thumbnailUrl = youtubeThumbnailUrl(project.sourceVideoUrl);

  return (
    <Link href={href} className="block h-full" data-testid="clips-project-card">
      <Card className="h-full transition-colors hover:shadow-border-strong">
        <div className="relative mb-3 aspect-video overflow-hidden rounded-md bg-background-secondary">
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
            {project.name}
          </h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {clipCountLabel(project.readyClipCount)}
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            {statusLabel(project.status)}
            {project.createdAt ? (
              <>
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                {getRelativeTime(project.createdAt)}
              </>
            ) : null}
          </p>
        </div>
      </Card>
    </Link>
  );
}

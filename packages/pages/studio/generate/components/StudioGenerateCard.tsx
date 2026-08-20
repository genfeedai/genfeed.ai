'use client';

import { ButtonSize, ButtonVariant, IngredientStatus } from '@genfeedai/enums';
import type { StudioGenerateCardProps } from '@genfeedai/props/studio/studio-generate.props';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

const AUDIO_TYPES = new Set(['music', 'voice']);
const VIDEO_TYPES = new Set(['video', 'avatar']);

/**
 * One asset in the results grid. A card is the whole lifecycle — queued,
 * rendered, or failed — so a generation never disappears and reappears
 * somewhere else once the socket resolves it.
 */
export default function StudioGenerateCard({
  job,
  onReprompt,
}: StudioGenerateCardProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const { label } = getStudioGenerateTypeConfig(job.type);
  const isFailed = job.status === IngredientStatus.FAILED;
  const isPending =
    job.status === IngredientStatus.PROCESSING ||
    job.status === IngredientStatus.DRAFT;

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-foreground/[0.04]">
        {isPending ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-xs">{translate('generating')}</span>
          </div>
        ) : null}

        {isFailed ? (
          <div className="flex flex-col items-center gap-2 px-3 text-center text-destructive">
            <AlertTriangle className="size-5" />
            <span className="text-xs">{job.error || 'Generation failed'}</span>
          </div>
        ) : null}

        {!isPending && !isFailed && job.url ? (
          AUDIO_TYPES.has(job.type) ? (
            // biome-ignore lint/a11y/useMediaCaption: generated audio has no track
            <audio className="w-full px-3" controls src={job.url} />
          ) : VIDEO_TYPES.has(job.type) ? (
            // biome-ignore lint/a11y/useMediaCaption: generated video has no track
            <video className="size-full object-cover" controls src={job.url} />
          ) : (
            <Image
              alt={job.prompt}
              className="object-cover"
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              src={job.url}
              unoptimized
            />
          )
        ) : null}

        <Badge
          className="absolute left-2 top-2 text-[0.625rem] uppercase tracking-wide"
          variant="secondary"
        >
          {label}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {job.prompt}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.625rem] text-muted-foreground/70">
            {job.modelKey || 'Auto'}
          </span>
          <Button
            ariaLabel="Reprompt"
            className="px-2 text-xs"
            icon={<RotateCcw className="size-3" />}
            label={isFailed ? 'Retry' : 'Reprompt'}
            onClick={() => onReprompt(job)}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </div>
      </div>
    </div>
  );
}

'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupPresetPreviewProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Illustrative layout/motion examples, never presented as provider samples. */
export default function GenerationSetupPresetPreview({
  preset,
  isAnimated = false,
  isCompact = false,
}: GenerationSetupPresetPreviewProps) {
  const translate = useTranslations('agent.generationSetup');
  const isProfile = preset.key === 'studio-profile-picture';
  const isBanner = preset.key === 'studio-banner';
  const isThumbnail = preset.key === 'studio-youtube-thumbnail';
  const isMeme = preset.key === 'studio-meme';
  const isAnimation = preset.key === 'studio-animation';
  const isDance = preset.key === 'studio-dance';
  const isMoving = isAnimated && preset.type === 'video';
  const [width, height] = preset.values.aspectRatio.split(':').map(Number);
  const ratio = width && height ? width / height : 1;
  return (
    <div
      role="img"
      aria-label={translate('presetPreviewAria', { label: preset.label })}
      className={cn(
        'flex flex-col items-center justify-center gap-2 overflow-hidden rounded-md bg-background-secondary p-3',
        isCompact ? 'h-40' : 'min-h-28',
      )}
    >
      <div
        style={{
          aspectRatio: preset.values.aspectRatio.replace(':', ' / '),
          ...(isCompact ? { width: `min(100%, calc(6rem * ${ratio}))` } : {}),
        }}
        className={cn(
          'relative flex w-full max-h-64 items-center justify-center overflow-hidden rounded-md',
          isProfile
            ? 'bg-indigo-950'
            : isBanner
              ? 'bg-teal-950'
              : isThumbnail
                ? 'bg-amber-400'
                : isMeme
                  ? 'bg-violet-950'
                  : isAnimation
                    ? 'bg-sky-950'
                    : 'bg-fuchsia-950',
          (isMeme || isDance) && 'max-w-28',
        )}
      >
        {isBanner ? (
          <div className="flex w-full items-center justify-between gap-4 px-4 py-2">
            <div className="space-y-2">
              <div className="h-2 w-16 rounded bg-white/90" />
              <div className="h-1 w-12 rounded bg-white/40" />
            </div>
            <div className="size-9 rounded-full bg-teal-300" />
          </div>
        ) : null}
        {isThumbnail ? (
          <div className="flex w-full items-center justify-around p-3">
            <span className="text-2xl font-black text-black">
              {translate('presetPreviewThumbnail')}
            </span>
            <UserRound className="size-12 text-black" />
          </div>
        ) : null}
        {isProfile || isMeme || isDance ? (
          <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3 p-3">
            {isMeme ? (
              <span className="text-2xs font-bold text-white">
                {translate('presetPreviewMemeSetup')}
              </span>
            ) : null}
            <div
              className={cn(
                'flex size-14 items-center justify-center rounded-full bg-white/15 text-white',
                isMoving && 'motion-safe:animate-bounce',
              )}
            >
              <UserRound className="size-10" />
            </div>
            {isMeme ? (
              <span className="text-2xs text-white/70">
                {translate('presetPreviewMemeReaction')}
              </span>
            ) : null}
          </div>
        ) : null}
        {isAnimation ? (
          <div
            className={cn(
              'my-6 size-12 rounded-xl bg-sky-300 shadow-lg shadow-sky-300/20',
              isMoving && 'motion-safe:animate-spin',
            )}
          />
        ) : null}
      </div>
      <span className="text-2xs text-muted-foreground">
        {translate('presetPreviewIllustrative')}
      </span>
    </div>
  );
}

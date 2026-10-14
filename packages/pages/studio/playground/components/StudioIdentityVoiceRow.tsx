'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import type { StudioIdentityVoiceRowProps } from '@genfeedai/props/studio/studio-playground.props';
import { useAudioPreview } from '@ui/audio/preview-player/AudioPreviewPlayer';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Check, Loader2, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/**
 * One voice: the round button only previews, the trailing button only selects,
 * so listening never changes the pick.
 */
export default function StudioIdentityVoiceRow({
  gender,
  isDisabled = false,
  isSelected,
  name,
  onSelect,
  previewUrl,
  source,
}: StudioIdentityVoiceRowProps): ReactElement {
  const translate = useTranslations('agent.generationSetup');
  const { currentTime, duration, isErrored, isLoading, isPlaying, toggle } =
    useAudioPreview({ audioUrl: previewUrl, stopOnUnmount: true });
  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,9rem)_auto]',
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:bg-muted/50',
      )}
    >
      <Button
        ariaLabel={
          previewUrl
            ? translate(
                isPlaying ? 'identityVoicePause' : 'identityVoicePreview',
                { label: name },
              )
            : translate('identityNoSample')
        }
        className={cn(
          'size-9 shrink-0 rounded-full',
          isPlaying && 'bg-foreground text-background hover:bg-foreground/90',
        )}
        icon={
          isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )
        }
        isDisabled={!previewUrl}
        onClick={toggle}
        size={ButtonSize.ICON}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[
            gender
              ? translate(
                  gender === 'male'
                    ? 'identityGenderMale'
                    : 'identityGenderFemale',
                )
              : null,
            source,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        {previewUrl ? (
          <>
            <Progress
              aria-label={translate('identityVoiceProgress', { label: name })}
              className="h-1 bg-muted"
              value={progress}
            />
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
              {isErrored
                ? translate('identityPreviewFailed')
                : formatDuration(duration || null)}
            </span>
          </>
        ) : (
          <span className="text-2xs text-muted-foreground">
            {translate('identityNoSample')}
          </span>
        )}
      </div>
      <Button
        aria-pressed={isSelected}
        ariaLabel={translate(
          isSelected ? 'identityVoiceSelected' : 'identityUseVoice',
          { label: name },
        )}
        className="min-w-20"
        icon={isSelected ? <Check className="size-3.5" /> : undefined}
        isDisabled={isDisabled}
        label={translate(isSelected ? 'identityUsing' : 'identityUse')}
        onClick={onSelect}
        size={ButtonSize.SM}
        variant={isSelected ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY}
        withWrapper={false}
      />
    </div>
  );
}

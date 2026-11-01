'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StoryboardPitchCardsProps } from '@/features/studio/props/storyboard-presets.props';
import { STORYBOARD_PITCHES } from '@/features/studio/storyboard/data/storyboard-pitches';

/** Three starter ideas for first-time users: a click fills the brief, never submits. */
export default function StoryboardPitchCards({
  activePitchId,
  isDisabled = false,
  isStacked = false,
  kind,
  onSelect,
}: StoryboardPitchCardsProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.pitches');

  return (
    <div
      aria-label={translate('groupAria')}
      className={cn('grid gap-3', isStacked ? 'grid-cols-1' : 'sm:grid-cols-3')}
      data-testid="storyboard-pitch-cards"
      role="group"
    >
      {STORYBOARD_PITCHES[kind].map((pitch) => {
        const Icon = pitch.icon;
        const title = translate(`items.${pitch.id}.title`);
        const isActive = activePitchId === pitch.id;
        return (
          <Button
            aria-pressed={isActive}
            ariaLabel={translate('prefillAria', { title })}
            className={cn(
              'flex-col items-start justify-start gap-2 whitespace-normal rounded-card bg-card p-3 text-left normal-case text-card-foreground shadow-border transition-[box-shadow] duration-150 hover:shadow-border-strong',
              isActive && 'ring-2 ring-primary',
              isDisabled && 'cursor-not-allowed opacity-60',
            )}
            isDisabled={isDisabled}
            key={pitch.id}
            onClick={() => onSelect(pitch)}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <Icon aria-hidden className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{title}</span>
            <span className="text-xs text-muted-foreground">
              {translate(`items.${pitch.id}.description`)}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

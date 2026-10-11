'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StoryboardPresetCardsProps } from '@genfeedai/props/studio/storyboard-presets.props';
import StoryboardPresetThumbnail from '@pages/studio/storyboard/components/StoryboardPresetThumbnail';
import { STORYBOARD_PRESETS } from '@pages/studio/storyboard/data/storyboard-presets';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/** Compact preset cards for the create page: a click prefills, never submits. */
export default function StoryboardPresetCards({
  activePresetId,
  isDisabled = false,
  onSelect,
}: StoryboardPresetCardsProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.presets');

  return (
    <div
      aria-label={translate('chipsAria')}
      className="flex flex-col gap-1.5"
      data-testid="storyboard-preset-cards"
      role="group"
    >
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STORYBOARD_PRESETS.map((preset) => {
          const title = translate(`items.${preset.id}.title`);
          const isActive = activePresetId === preset.id;
          return (
            <Button
              aria-pressed={isActive}
              ariaLabel={translate('prefillAria', { title })}
              className={cn(
                'w-44 shrink-0 normal-case snap-start flex-col items-stretch gap-0 overflow-hidden rounded-card bg-card text-left text-card-foreground shadow-border transition-[box-shadow] duration-150 hover:shadow-border-strong sm:w-52',
                isActive && 'ring-2 ring-primary',
                isDisabled && 'cursor-not-allowed opacity-60',
              )}
              data-testid="storyboard-preset-card"
              isDisabled={isDisabled}
              key={preset.id}
              onClick={() => onSelect(preset)}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <StoryboardPresetThumbnail src={preset.thumbnailSrc} />
              <span className="flex flex-col gap-0.5 p-2.5">
                <span className="truncate text-sm font-medium">{title}</span>
                <span className="text-xs text-muted-foreground">
                  {preset.format}
                  {' · '}
                  {translate('runtime', {
                    seconds: preset.runtimeBudgetSeconds,
                  })}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

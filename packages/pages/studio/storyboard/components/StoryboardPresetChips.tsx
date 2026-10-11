'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardPresetChipsProps } from '@genfeedai/props/studio/storyboard-presets.props';
import { STORYBOARD_PRESETS } from '@pages/studio/storyboard/data/storyboard-presets';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/** Compact preset row for the create page: a click prefills, never submits. */
export default function StoryboardPresetChips({
  isDisabled = false,
  onSelect,
}: StoryboardPresetChipsProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.presets');

  return (
    <div
      aria-label={translate('chipsAria')}
      className="mb-2 flex flex-col gap-1.5"
      role="group"
    >
      <p className="text-xs text-muted-foreground">{translate('chipsLabel')}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STORYBOARD_PRESETS.map((preset) => (
          <Button
            ariaLabel={translate('prefillAria', {
              title: translate(`items.${preset.id}.title`),
            })}
            className="shrink-0"
            icon={<preset.icon className="size-3.5" />}
            isDisabled={isDisabled}
            key={preset.id}
            label={translate(`items.${preset.id}.title`)}
            onClick={() => onSelect(preset)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        ))}
      </div>
    </div>
  );
}

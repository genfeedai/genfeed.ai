'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StoryboardPresetCardsProps } from '@/features/studio/props/storyboard-presets.props';
import { STORYBOARD_PRESETS } from '@/features/studio/storyboard/data/storyboard-presets';

/**
 * Preset starting points in the same pill style as the main Agent's
 * suggestions: a click prefills the composer, never submits.
 */
export default function StoryboardPresetCards({
  isDisabled = false,
  onSelect,
}: StoryboardPresetCardsProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.presets');
  const suggestions: PromptBarSuggestionItem[] = STORYBOARD_PRESETS.map(
    (preset) => {
      const Icon = preset.icon;
      return {
        description: `${preset.format} · ${translate('runtime', {
          seconds: preset.runtimeBudgetSeconds,
        })}`,
        icon: <Icon />,
        id: preset.id,
        label: translate(`items.${preset.id}.title`),
        prompt: preset.brief,
      };
    },
  );

  return (
    <div
      aria-label={translate('chipsAria')}
      className="@container w-full min-w-0"
      data-testid="storyboard-preset-cards"
      role="group"
    >
      <PromptBarSuggestions
        className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4 [&>button]:w-full [&>button]:max-w-none"
        isDisabled={isDisabled}
        maxSuggestions={STORYBOARD_PRESETS.length}
        onSuggestionSelect={(item) => {
          const preset = STORYBOARD_PRESETS.find(
            (candidate) => candidate.id === item.id,
          );
          if (preset) onSelect(preset);
        }}
        suggestions={suggestions}
        variant="chips"
      />
    </div>
  );
}

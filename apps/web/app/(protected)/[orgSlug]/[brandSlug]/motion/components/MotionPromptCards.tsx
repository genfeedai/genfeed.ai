'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { MotionPromptCardsProps } from '@/features/motion/props/motion-presets.props';
import { MOTION_PRESETS } from '../data/motion-presets';

/**
 * The Motion starters as prompt cards, in the same tiles as the Agent and
 * Storyboard. A click only fills the compose form; nothing is quoted,
 * submitted or charged until the creator requests a quote and confirms it.
 */
export default function MotionPromptCards({
  isDisabled = false,
  onApply,
}: MotionPromptCardsProps): ReactElement {
  const translate = useTranslations('pages.studioMotion.presets.items');
  const suggestions: PromptBarSuggestionItem[] = MOTION_PRESETS.map(
    (preset) => {
      const Icon = preset.icon;
      return {
        description: translate(`${preset.id}.description`),
        icon: <Icon />,
        id: preset.id,
        label: translate(`${preset.id}.title`),
        prompt: preset.prompt,
      };
    },
  );

  return (
    <div
      className="@container w-full min-w-0"
      data-testid="motion-prompt-cards"
    >
      <PromptBarSuggestions
        className="grid grid-cols-1 @md:grid-cols-2 [&>button]:w-full [&>button]:max-w-none"
        isDisabled={isDisabled}
        maxSuggestions={MOTION_PRESETS.length}
        onSuggestionSelect={(suggestion) => {
          const preset = MOTION_PRESETS.find(
            (candidate) => candidate.id === suggestion.id,
          );
          if (preset) onApply(preset);
        }}
        suggestions={suggestions}
        variant="cards"
      />
    </div>
  );
}

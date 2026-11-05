'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import { starterThumbnail } from '@helpers/media/starter/starter-thumbnail.helper';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { ClipperPromptCardsProps } from '@/features/clipper/props/clipper-presets.props';
import { CLIPPER_PRESETS } from '../data/clipper-presets';

/**
 * The Clipper starters as prompt cards, in the same tiles as the Agent and
 * Storyboard. A click only chooses the clip style; the creator still adds the
 * source, so nothing is imported or charged.
 */
export default function ClipperPromptCards({
  isDisabled = false,
  onSelect,
}: ClipperPromptCardsProps): ReactElement {
  const translate = useTranslations('pages.studioClipper.presets.items');
  const suggestions: PromptBarSuggestionItem[] = CLIPPER_PRESETS.map(
    (preset) => {
      const Icon = preset.icon;
      return {
        description: translate(`${preset.id}.description`),
        icon: <Icon />,
        id: preset.id,
        label: translate(`${preset.id}.title`),
        // A style sends nothing, so there is no prompt text to preview.
        prompt: '',
        thumbnailUrl: starterThumbnail('clipper', preset.id),
      };
    },
  );

  return (
    <div
      className="@container w-full min-w-0"
      data-testid="clipper-prompt-cards"
    >
      <PromptBarSuggestions
        className="grid grid-cols-1 @md:grid-cols-2 [&>button]:w-full [&>button]:max-w-none"
        isDisabled={isDisabled}
        onSuggestionSelect={(suggestion) => {
          const preset = CLIPPER_PRESETS.find(
            (candidate) => candidate.id === suggestion.id,
          );
          if (preset) onSelect(preset);
        }}
        suggestions={suggestions}
        variant="cards"
      />
    </div>
  );
}

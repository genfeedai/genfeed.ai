'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StoryboardPresetCardsProps } from '@/features/studio/props/storyboard-presets.props';
import { STORYBOARD_PRESETS } from '@/features/studio/storyboard/data/storyboard-presets';

/**
 * The storyboard presets as prompt cards, in the same tiles as the other
 * creative apps. A click prefills the brief, format and runtime; it never
 * submits. Each card keeps its format and runtime in front of the description
 * so presets stay comparable. They scroll sideways so eight of them stay one row tall.
 */
export default function StoryboardPresetCards({
  activePresetId,
  isDisabled = false,
  onSelect,
}: StoryboardPresetCardsProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.presets');
  const suggestions: PromptBarSuggestionItem[] = STORYBOARD_PRESETS.map(
    (preset) => ({
      description: `${preset.format} · ${translate('runtime', {
        seconds: preset.runtimeBudgetSeconds,
      })} · ${translate(`items.${preset.id}.description`)}`,
      id: preset.id,
      label: translate(`items.${preset.id}.title`),
      prompt: preset.brief,
      thumbnailUrl: preset.thumbnailSrc,
    }),
  );

  return (
    <div className="w-full min-w-0" data-testid="storyboard-preset-cards">
      <PromptBarSuggestions
        activeId={activePresetId ?? ''}
        className="-mx-1 flex snap-x overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:w-44 [&>button]:max-w-none [&>button]:shrink-0 [&>button]:snap-start sm:[&>button]:w-52"
        isDisabled={isDisabled}
        maxSuggestions={STORYBOARD_PRESETS.length}
        onSuggestionSelect={(suggestion) => {
          const preset = STORYBOARD_PRESETS.find(
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

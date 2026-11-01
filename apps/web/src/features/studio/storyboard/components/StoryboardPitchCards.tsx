'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StoryboardPitchCardsProps } from '@/features/studio/props/storyboard-presets.props';
import { STORYBOARD_PITCHES } from '@/features/studio/storyboard/data/storyboard-pitches';

/**
 * Three starter ideas for first-time users, in the same rows as the main
 * agent's "Start a chat" suggestions: a click fills the brief, never submits.
 */
export default function StoryboardPitchCards({
  isDisabled = false,
  kind,
  onSelect,
}: StoryboardPitchCardsProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.pitches');
  const pitches = STORYBOARD_PITCHES[kind];
  const suggestions: PromptBarSuggestionItem[] = pitches.map((pitch) => {
    const Icon = pitch.icon;
    return {
      description: translate(`items.${pitch.id}.description`),
      icon: <Icon />,
      id: pitch.id,
      label: translate(`items.${pitch.id}.title`),
      prompt: pitch.brief,
    };
  });

  return (
    <div
      className="@container w-full min-w-0"
      data-testid="storyboard-pitch-cards"
    >
      <PromptBarSuggestions
        className="grid grid-cols-1 [&>button]:w-full [&>button]:max-w-none"
        isDisabled={isDisabled}
        onSuggestionSelect={(suggestion) => {
          const pitch = pitches.find(
            (candidate) => candidate.id === suggestion.id,
          );
          if (pitch) onSelect(pitch);
        }}
        suggestions={suggestions}
      />
    </div>
  );
}

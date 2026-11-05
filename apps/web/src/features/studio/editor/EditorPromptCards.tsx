'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import { starterThumbnail } from '@helpers/media/starter/starter-thumbnail.helper';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { EditorPromptCardsProps } from '@/features/studio/props/editor-workspace.props';
import { EDITOR_STARTERS } from './editor-formats';

/**
 * The Editor starters as prompt cards, in the same tiles as the Agent, Turbo
 * and Storyboard. A click fills the name and the canvas; it never creates
 * anything.
 */
export default function EditorPromptCards({
  isDisabled = false,
  onSelect,
}: EditorPromptCardsProps): ReactElement {
  const translate = useTranslations('pages.studioEditor.starters');
  const suggestions: PromptBarSuggestionItem[] = EDITOR_STARTERS.map(
    (starter) => {
      const Icon = starter.icon;
      return {
        description: translate(`${starter.id}.description`),
        icon: <Icon />,
        id: starter.id,
        label: translate(`${starter.id}.title`),
        prompt: translate(`${starter.id}.title`),
        thumbnailUrl: starterThumbnail('editor', starter.id),
      };
    },
  );

  return (
    <div
      className="@container w-full min-w-0"
      data-testid="editor-prompt-cards"
    >
      <PromptBarSuggestions
        className="grid grid-cols-1 @md:grid-cols-3 [&>button]:w-full [&>button]:max-w-none"
        isDisabled={isDisabled}
        onSuggestionSelect={(suggestion) => {
          const starter = EDITOR_STARTERS.find(
            (candidate) => candidate.id === suggestion.id,
          );
          if (starter) onSelect(starter, suggestion.label);
        }}
        suggestions={suggestions}
        variant="cards"
      />
    </div>
  );
}

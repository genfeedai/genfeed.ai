'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import { starterThumbnail } from '@helpers/media/starter/starter-thumbnail.helper';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { useTurboBrandIdeas } from '@/features/workflows/hooks/use-turbo-brand-ideas';
import type { TurboPresetCardsProps } from '@/features/workflows/props/turbo-presets.props';
import { TURBO_PRESETS } from './turbo-presets';

/**
 * The three Turbo starters, in the shared suggestion tiles. They are the
 * agent's ideas for this brand (an angle, formats and batch size written from
 * the brand kit and what has performed); a brand with no approved kit, or none
 * yet, gets the brand-neutral starters. A click fills the prompt, the format
 * and the idea count; it never creates anything.
 */
export default function TurboPromptCards({
  brandId,
  isDisabled = false,
  onSelect,
}: TurboPresetCardsProps): ReactElement | null {
  const translate = useTranslations('pages.turboProjects.presets');
  const { isBrandApproved, isLoading, proposals } = useTurboBrandIdeas(brandId);

  if (isLoading) {
    return (
      <p
        aria-live="polite"
        className="text-center text-sm text-muted-foreground"
        role="status"
      >
        {translate('loading')}
      </p>
    );
  }

  const hasIdeas = isBrandApproved && proposals.length > 0;
  const suggestions: PromptBarSuggestionItem[] = hasIdeas
    ? proposals.map((proposal, index) => ({
        description: proposal.why,
        icon: <Sparkles />,
        id: String(index),
        label: proposal.title,
        prompt: proposal.angle,
      }))
    : TURBO_PRESETS.map((preset) => {
        const Icon = preset.icon;
        return {
          description: translate(`items.${preset.id}.description`),
          icon: <Icon />,
          id: preset.id,
          label: translate(`items.${preset.id}.title`),
          prompt: preset.angle,
          thumbnailUrl: starterThumbnail('turbo', preset.id),
        };
      });

  return (
    <div
      className="@container flex w-full min-w-0 flex-col gap-3"
      data-testid="turbo-prompt-cards"
    >
      {isBrandApproved ? null : (
        <p
          className="text-center text-sm text-muted-foreground"
          data-testid="turbo-brand-approval"
        >
          {translate('needsBrandApproval')}
        </p>
      )}
      <PromptBarSuggestions
        className="grid grid-cols-1 @lg:grid-cols-3 [&>button]:w-full [&>button]:max-w-none"
        isDisabled={isDisabled}
        onSuggestionSelect={(suggestion) => {
          const starter = hasIdeas
            ? proposals[Number(suggestion.id)]
            : TURBO_PRESETS.find((candidate) => candidate.id === suggestion.id);
          if (starter) onSelect(starter, suggestion.label);
        }}
        suggestions={suggestions}
        variant="cards"
      />
    </div>
  );
}

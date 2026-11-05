'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StoryboardStarterCardsProps } from '@/features/studio/props/storyboard-presets.props';
import { STORYBOARD_PRESETS } from '@/features/studio/storyboard/data/storyboard-presets';
import { useStoryboardAgentBriefs } from '@/features/studio/storyboard/hooks/use-storyboard-agent-briefs';
import { storyboardProposalRuntime } from '@/features/studio/storyboard/utils/storyboard-agent-brief';

const STARTER_COUNT = 3;

/**
 * The three Storyboard starters, in the shared suggestion tiles. They are the
 * agent's briefs for this brand (written from the brand kit and what has
 * performed); a brand with no approved kit, or none yet, gets the brand-neutral
 * presets. A click fills the brief, its shot plan and the runtime; it never
 * submits.
 */
export default function StoryboardStarterCards({
  activePresetId,
  brandId,
  isDisabled = false,
  onSelectBrief,
  onSelectPreset,
}: StoryboardStarterCardsProps): ReactElement {
  const presetTranslate = useTranslations('pages.studioStoryboard.presets');
  const briefTranslate = useTranslations('pages.studioStoryboard.agentBriefs');
  const { isBrandApproved, isLoading, proposals } =
    useStoryboardAgentBriefs(brandId);

  if (isLoading) {
    return (
      <p
        aria-live="polite"
        className="text-center text-sm text-muted-foreground"
        role="status"
      >
        {briefTranslate('loading')}
      </p>
    );
  }

  const briefs = isBrandApproved ? proposals.slice(0, STARTER_COUNT) : [];
  const hasBriefs = briefs.length > 0;
  const suggestions: PromptBarSuggestionItem[] = hasBriefs
    ? briefs.map((proposal, index) => ({
        description: `${briefTranslate('runtime', {
          seconds: storyboardProposalRuntime(proposal),
          shots: proposal.shots.length,
        })} · ${proposal.why}`,
        icon: <Sparkles />,
        id: String(index),
        label: proposal.title,
        prompt: proposal.brief,
      }))
    : STORYBOARD_PRESETS.slice(0, STARTER_COUNT).map((preset) => ({
        description: `${preset.format} · ${presetTranslate('runtime', {
          seconds: preset.runtimeBudgetSeconds,
        })} · ${presetTranslate(`items.${preset.id}.description`)}`,
        id: preset.id,
        label: presetTranslate(`items.${preset.id}.title`),
        prompt: preset.brief,
        thumbnailUrl: preset.thumbnailSrc,
      }));

  return (
    <div
      className="@container flex w-full min-w-0 flex-col gap-3"
      data-testid="storyboard-starter-cards"
    >
      {isBrandApproved ? null : (
        <p
          className="text-center text-sm text-muted-foreground"
          data-testid="storyboard-agent-briefs-approval"
        >
          {briefTranslate('needsBrandApproval')}
        </p>
      )}
      <PromptBarSuggestions
        activeId={hasBriefs ? '' : (activePresetId ?? '')}
        className="grid grid-cols-1 @lg:grid-cols-3 [&>button]:w-full [&>button]:max-w-none"
        isDisabled={isDisabled}
        onSuggestionSelect={(suggestion) => {
          if (hasBriefs) {
            const brief = briefs[Number(suggestion.id)];
            if (brief) onSelectBrief(brief);
            return;
          }
          const preset = STORYBOARD_PRESETS.find(
            (candidate) => candidate.id === suggestion.id,
          );
          if (preset) onSelectPreset(preset);
        }}
        suggestions={suggestions}
        variant="cards"
      />
    </div>
  );
}

'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StoryboardAgentBriefsProps } from '@genfeedai/props/studio/storyboard-presets.props';
import { useStoryboardAgentBriefs } from '@pages/studio/storyboard/hooks/use-storyboard-agent-briefs';
import { storyboardProposalRuntime } from '@pages/studio/storyboard/utils/storyboard-agent-brief';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/**
 * The agent's storyboard briefs for the create page (#7341): a click fills
 * the brief, its shot plan and the runtime, never submits. Renders nothing
 * when the call failed, leaving the presets as the fallback.
 */
export default function StoryboardAgentBriefs({
  brandId,
  isDisabled = false,
  onSelect,
}: StoryboardAgentBriefsProps): ReactElement | null {
  const translate = useTranslations('pages.studioStoryboard.agentBriefs');
  const { isBrandApproved, isLoading, proposals } =
    useStoryboardAgentBriefs(brandId);

  if (!isBrandApproved) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="storyboard-agent-briefs-approval"
      >
        {translate('needsBrandApproval')}
      </p>
    );
  }
  if (isLoading) {
    return (
      <p
        aria-live="polite"
        className="text-sm text-muted-foreground"
        role="status"
      >
        {translate('loading')}
      </p>
    );
  }
  if (proposals.length === 0) return null;

  return (
    <section
      aria-label={translate('title')}
      className="flex flex-col gap-2"
      data-testid="storyboard-agent-briefs"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium text-foreground">
          {translate('title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {translate('description')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {proposals.map((proposal) => (
          <Button
            ariaLabel={translate('apply', { title: proposal.title })}
            className={cn(
              'flex h-auto w-full flex-col items-start gap-1.5 rounded-card bg-card p-3 text-left normal-case text-card-foreground shadow-border transition-[box-shadow] duration-150 hover:shadow-border-strong',
              isDisabled && 'cursor-not-allowed opacity-60',
            )}
            isDisabled={isDisabled}
            key={`${proposal.title}:${proposal.brief}`}
            onClick={() => onSelect(proposal)}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <span className="text-sm font-medium">{proposal.title}</span>
            <span className="text-xs text-muted-foreground">
              {translate('runtime', {
                seconds: storyboardProposalRuntime(proposal),
                shots: proposal.shots.length,
              })}
            </span>
            <span className="line-clamp-3 text-xs text-muted-foreground">
              {proposal.brief}
            </span>
            <span className="text-xs text-foreground/70">{proposal.why}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}

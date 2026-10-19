'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { StudioPlaygroundAgentProposalsProps } from '@genfeedai/props/studio/studio-playground.props';
import { useStudioPlaygroundProposals } from '@pages/studio/playground/hooks/useStudioPlaygroundProposals';
import { buildStarterIdeaDocument } from '@pages/studio/playground/utils/studio-playground-starter-ideas';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/**
 * The agent's drafts for an empty Playground (#7341): each card fills the
 * prompt and aspect ratio, so the human only edits and generates. Renders
 * nothing when the type has no proposals or the call failed, leaving the
 * starter ideas as the fallback.
 */
export default function StudioPlaygroundAgentProposals({
  brandId,
  isDisabled = false,
  onSelect,
  type,
}: StudioPlaygroundAgentProposalsProps): ReactElement | null {
  const translate = useTranslations('pages.studioPlayground.agentProposals');
  const { isBrandApproved, isLoading, proposals } =
    useStudioPlaygroundProposals(brandId, type);

  if (!isBrandApproved) {
    return (
      <p
        className="mx-auto w-full max-w-4xl pt-8 text-center text-sm text-muted-foreground"
        data-testid="studio-playground-agent-proposals-approval"
      >
        {translate('needsBrandApproval')}
      </p>
    );
  }
  if (isLoading) {
    return (
      <p
        aria-live="polite"
        className="mx-auto w-full max-w-4xl pt-8 text-center text-sm text-muted-foreground"
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
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 pt-8"
      data-testid="studio-playground-agent-proposals"
    >
      <div className="flex flex-col gap-1 text-center">
        <h2 className="text-lg font-medium text-foreground">
          {translate('title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translate('description')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {proposals.map((proposal, index) => (
          <Button
            ariaLabel={translate('apply', { title: proposal.title })}
            className={[
              'flex h-auto w-full flex-col items-start gap-2',
              'rounded-2xl border border-border bg-background px-3.5 py-3.5',
              'text-left normal-case tracking-normal text-foreground/88',
              'shadow-md shadow-black/25 transition-colors',
              'hover:border-border/80 hover:bg-background-secondary',
            ].join(' ')}
            isDisabled={isDisabled}
            key={`${proposal.title}:${proposal.prompt}`}
            onClick={() => {
              onSelect({
                agentPrompt: proposal.prompt,
                aspectRatio: proposal.aspectRatio,
                content: buildStarterIdeaDocument(
                  proposal.prompt,
                  undefined,
                  undefined,
                ),
                seedId: `proposal:${index}:${Date.now()}`,
                type,
              });
            }}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium">{proposal.title}</span>
              <span className="text-xs text-muted-foreground">
                {proposal.aspectRatio}
              </span>
            </span>
            <span className="line-clamp-3 text-xs text-muted-foreground">
              {proposal.prompt}
            </span>
            <span className="text-xs text-foreground/70">{proposal.why}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}

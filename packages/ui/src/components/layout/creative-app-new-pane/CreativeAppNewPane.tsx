import type { CreativeAppNewPaneProps } from '@genfeedai/props/ui/layout/creative-app-layout.props';
import PromptEmptyState from '@ui/layout/prompt-empty-state/PromptEmptyState';
import type { ReactElement } from 'react';

/**
 * The left column of a creative app while no project is open: a centered hero
 * with starter cards, and the prompt bar pinned under it. The hero takes the
 * space the bar leaves and scrolls only when a short window truly cannot fit
 * it, so a tall bar (a banner, a quote) never covers the cards.
 */
export default function CreativeAppNewPane({
  body,
  children,
  description,
  isWide = false,
  promptBar,
  testId,
  title,
}: CreativeAppNewPaneProps): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={testId}>
      {body ?? (
        <PromptEmptyState
          description={description}
          isInFlow
          isWide={isWide}
          title={title ?? ''}
        >
          {children}
        </PromptEmptyState>
      )}
      <div className="mx-auto w-full max-w-2xl shrink-0 px-3 pb-3">
        {promptBar}
      </div>
    </div>
  );
}

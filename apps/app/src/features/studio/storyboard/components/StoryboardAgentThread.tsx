'use client';

import type { StoryboardAgentThreadProps } from '@genfeedai/props/studio/storyboard.props';
import { useTranslations } from 'next-intl';
import StoryboardPromptBar from '@/features/studio/storyboard/components/StoryboardPromptBar';

/**
 * The agent column of a storyboard run: what was asked of the board and how
 * each request went, with the composer at the foot. The board itself is the
 * output on the right, so a result reads as one line here.
 */
export default function StoryboardAgentThread({
  canCompose,
  error,
  hasShots,
  isDisabled,
  onRetry,
  onSubmit,
  requests,
}: StoryboardAgentThreadProps) {
  const translate = useTranslations('pages.studioStoryboard.agentThread');

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="storyboard-agent"
    >
      <div
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        role="log"
      >
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {!canCompose
              ? translate('unavailable')
              : hasShots
                ? translate('emptyChanges')
                : translate('emptyBrief')}
          </p>
        ) : null}
        {requests.map((request) => (
          <div className="flex flex-col gap-2" key={request.id}>
            <p className="ml-auto max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-sm text-foreground">
              {request.text}
            </p>
            <p
              className={
                request.state === 'failed'
                  ? 'max-w-[92%] text-sm text-destructive'
                  : 'max-w-[92%] text-sm text-foreground'
              }
              data-state={request.state}
              role="status"
            >
              {request.state === 'working'
                ? translate('working')
                : request.state === 'failed'
                  ? translate('failed')
                  : request.kind === 'brief'
                    ? translate('briefDone')
                    : translate('changeDone')}
            </p>
          </div>
        ))}
      </div>
      {canCompose ? (
        <div className="shrink-0 px-4 pb-4">
          <StoryboardPromptBar
            error={error}
            hasShots={hasShots}
            isDisabled={isDisabled}
            onRetry={onRetry}
            onSubmit={onSubmit}
            variant="pane"
          />
        </div>
      ) : null}
    </div>
  );
}

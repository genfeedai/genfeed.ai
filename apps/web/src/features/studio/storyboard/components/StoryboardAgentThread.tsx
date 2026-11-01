'use client';

import { AgentChatSuggestionsBar } from '@genfeedai/agent/components/AgentChatSuggestionsBar';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  StoryboardAgentThreadProps,
  StoryboardPromptPrefill,
} from '@/features/studio/props/storyboard.props';
import StoryboardPromptBar from '@/features/studio/storyboard/components/StoryboardPromptBar';

const VIDEO_STARTER_IDS = ['productTeaser', 'founderStory', 'howTo'] as const;
const SLIDESHOW_STARTER_IDS = ['tips', 'beforeAfter', 'mythBusting'] as const;

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
  isSlideshow = false,
  onRetry,
  onSubmit,
  requests,
}: StoryboardAgentThreadProps) {
  const translate = useTranslations('pages.studioStoryboard.agentThread');
  const [prefill, setPrefill] = useState<StoryboardPromptPrefill>();
  const showStarters = requests.length === 0 && canCompose && !hasShots;

  const isEmpty = requests.length === 0;
  const kind = isSlideshow ? 'slideshow' : 'video';
  const starters: SuggestedAction[] = showStarters
    ? (isSlideshow ? SLIDESHOW_STARTER_IDS : VIDEO_STARTER_IDS).map((id) => {
        const prompt = translate(`starters.${kind}.${id}.prompt`);
        return {
          description: prompt,
          id,
          label: translate(`starters.${kind}.${id}.title`),
          prompt,
        };
      })
    : [];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="storyboard-agent"
    >
      <div
        aria-live="polite"
        className={cn(
          'relative flex min-h-0 flex-1 flex-col',
          isEmpty ? 'overflow-hidden' : 'gap-4 overflow-y-auto px-4 py-4',
        )}
        role="log"
      >
        {isEmpty ? (
          // Same centered empty state as the default agent surface.
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 md:px-6">
            <div className="pointer-events-auto flex max-h-[calc(100%-10rem)] w-full max-w-2xl flex-col items-center gap-5 overflow-y-auto">
              <div className="w-full text-center">
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground md:text-[1.75rem]">
                  {translate(
                    hasShots ? 'emptyTitleChanges' : 'emptyTitleBrief',
                  )}
                </h2>
                <p className="mt-2 break-words text-sm leading-5 text-muted-foreground">
                  {!canCompose
                    ? translate('unavailable')
                    : hasShots
                      ? translate(isSlideshow ? 'emptySlides' : 'emptyChanges')
                      : translate('emptyBrief')}
                </p>
              </div>
              {showStarters ? (
                <div className="w-full" data-testid="storyboard-starter-cards">
                  <AgentChatSuggestionsBar
                    isReadOnly={isDisabled}
                    layout="equal"
                    onSend={(content) =>
                      setPrefill((current) => ({
                        content,
                        nonce: (current?.nonce ?? 0) + 1,
                      }))
                    }
                    suggestedActions={starters}
                  />
                </div>
              ) : null}
            </div>
          </div>
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
        <div className="shrink-0 px-4 pb-4 md:px-6">
          <StoryboardPromptBar
            error={error}
            isSlideshow={isSlideshow}
            hasShots={hasShots}
            isDisabled={isDisabled}
            onRetry={onRetry}
            onSubmit={onSubmit}
            prefill={prefill}
            variant="pane"
          />
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardPromptBarProps } from '@genfeedai/props/studio/storyboard.props';
import Alert from '@ui/feedback/alert/Alert';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

/**
 * The Agent's own composer. Before the first draft it takes the brief; once
 * there are shots it takes change requests. The Agent-only controls are hidden.
 */
export default function StoryboardPromptBar({
  error,
  hasShots,
  isDisabled,
  onRetry,
  onSubmit,
}: StoryboardPromptBarProps) {
  const translate = useTranslations('pages.studioStoryboard.promptBar');
  return (
    <div className="sticky bottom-4 z-10 mx-auto mt-6 w-full max-w-4xl">
      <PromptBarContainer
        layoutMode="inflow"
        maxWidth="full"
        showTopFade
        topContent={
          error ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Alert type={AlertCategory.ERROR}>{error}</Alert>
              <Button
                label={translate('retry')}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                onClick={onRetry}
              />
            </div>
          ) : undefined
        }
      >
        <AgentChatInput
          disabled={isDisabled}
          isAgentControlsHidden
          onSend={(content) => {
            void onSubmit(content);
            return true;
          }}
          placeholder={
            hasShots
              ? translate('changesPlaceholder')
              : translate('briefPlaceholder')
          }
        />
      </PromptBarContainer>
    </div>
  );
}

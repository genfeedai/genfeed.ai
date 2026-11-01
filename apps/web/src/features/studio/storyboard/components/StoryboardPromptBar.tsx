'use client';

import { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { StoryboardPromptBarProps } from '@/features/studio/props/storyboard.props';

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
  variant = 'page',
}: StoryboardPromptBarProps) {
  const translate = useTranslations('pages.studioStoryboard.promptBar');
  return (
    <PromptBarContainer
      className={variant === 'pane' ? 'pt-2' : 'pt-6'}
      layoutMode={variant === 'pane' ? 'inflow' : 'sticky-bottom'}
      maxWidth={variant === 'pane' ? 'full' : '4xl'}
      topContent={
        error ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Alert variant="destructive">{error}</Alert>
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
  );
}

'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { MessagesReplyComposerProps } from '@genfeedai/props/messages/messages-reply-composer.props';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Reply / DM composer for the selected conversation, built from the shared
 * prompt-bar pieces. Context, status and failures all live inside the bar.
 */
export default function MessagesReplyComposer({
  availability,
  busyAction,
  draft,
  error,
  notice,
  onAction,
  onDraftChange,
  onSuggestedReply,
  participantLabel,
}: MessagesReplyComposerProps) {
  const translate = useTranslations('common.messages');
  const isBusy = Boolean(busyAction);
  const hasDraft = Boolean(draft.trim());
  const canReply = hasDraft && !isBusy && availability.canPostReply;
  const canDm = hasDraft && !isBusy && availability.canSendDm;

  // Enter sends the way the thread allows: a reply where one can be posted,
  // otherwise a DM.
  const handleSubmit = () => {
    if (canReply) {
      onAction('reply');
    } else if (canDm) {
      onAction('dm');
    }
  };

  const banner =
    error || notice ? (
      <div className="flex flex-col">
        {error ? (
          <p
            className="bg-destructive/10 px-3.5 py-2 text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            aria-live="polite"
            className="bg-success/10 px-3.5 py-2 text-xs text-success"
            role="status"
          >
            {notice}
          </p>
        ) : null}
      </div>
    ) : undefined;

  return (
    <PromptBarContainer
      className="shrink-0 border-t border-border p-4"
      layoutMode="inflow"
      maxWidth="full"
    >
      <PromptBarComposer
        banner={banner}
        beforeBody={
          <div className="flex flex-col gap-0.5 px-3.5 pt-2.5">
            <p className="flex items-center gap-1.5 text-2xs font-medium text-foreground/55">
              <span>{translate('replyComposer.title')}</span>
              <span className="rounded bg-tertiary px-1.5 py-0.5 text-foreground/80">
                {participantLabel}
              </span>
            </p>
            <p className="text-2xs text-foreground/45">
              {translate('replyComposer.description')}{' '}
              {availability.canSendDm
                ? 'DM is available for this thread.'
                : availability.sendDmReason}
            </p>
          </div>
        }
        data-testid="messages-reply-composer"
        density="compact"
      >
        <PromptEditor
          ariaLabel={translate('replyComposer.ariaLabel')}
          className="min-h-12"
          onSubmit={handleSubmit}
          onValueChange={onDraftChange}
          placeholder={translate('replyComposer.placeholder')}
          value={draft}
        />
        <PromptBarToolbar
          density="compact"
          leading={
            <Button
              icon={<Sparkles className="size-4" />}
              isDisabled={isBusy}
              isLoading={busyAction === 'suggested-reply'}
              onClick={onSuggestedReply}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
            >
              {translate('actions.draftReply')}
            </Button>
          }
          trailing={
            <>
              <Button
                isDisabled={isBusy || !hasDraft}
                isLoading={busyAction === 'draft'}
                onClick={() => onAction('draft')}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              >
                {translate('actions.saveDraft')}
              </Button>
              <Button
                isDisabled={!canDm}
                isLoading={busyAction === 'dm'}
                onClick={() => onAction('dm')}
                size={ButtonSize.SM}
                title={availability.sendDmReason}
                variant={ButtonVariant.GHOST}
              >
                {translate('actions.dm')}
              </Button>
              <PromptBarSendButton
                ariaLabel={translate('actions.reply')}
                density="compact"
                isDisabled={!canReply}
                isLoading={busyAction === 'reply'}
                onClick={() => onAction('reply')}
                tooltip={
                  availability.postReplyReason ?? translate('actions.reply')
                }
              />
            </>
          }
        />
      </PromptBarComposer>
    </PromptBarContainer>
  );
}

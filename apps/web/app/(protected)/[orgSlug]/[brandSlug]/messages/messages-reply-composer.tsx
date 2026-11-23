'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { Mail, Save, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MessagesReplyComposerProps } from '@/features/messages/props/messages-reply-composer.props';

/**
 * Reply / DM composer for the selected conversation, built from the shared
 * prompt-bar pieces. Status and failures live inside the bar; the actions are
 * icon-only with a tooltip.
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
          <Alert size="sm" variant="destructive">
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert size="sm" variant="success">
            {notice}
          </Alert>
        ) : null}
      </div>
    ) : undefined;

  return (
    <PromptBarContainer
      className="shrink-0 p-4"
      layoutMode="inflow"
      maxWidth="full"
    >
      <PromptBarComposer
        banner={banner}
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
          leading={
            <Button
              ariaLabel={translate('actions.draftReply')}
              icon={<Sparkles className="size-4" />}
              isDisabled={isBusy}
              isLoading={busyAction === 'suggested-reply'}
              onClick={onSuggestedReply}
              size={ButtonSize.ICON}
              tooltip={translate('actions.draftReply')}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          }
          trailing={
            <>
              <Button
                ariaLabel={translate('actions.saveDraft')}
                icon={<Save className="size-4" />}
                isDisabled={isBusy || !hasDraft}
                isLoading={busyAction === 'draft'}
                onClick={() => onAction('draft')}
                size={ButtonSize.ICON}
                tooltip={translate('actions.saveDraft')}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
              <Button
                ariaLabel={translate('actions.dm')}
                icon={<Mail className="size-4" />}
                isDisabled={!canDm}
                isLoading={busyAction === 'dm'}
                onClick={() => onAction('dm')}
                size={ButtonSize.ICON}
                tooltip={availability.sendDmReason ?? translate('actions.dm')}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
              <PromptBarSendButton
                ariaLabel={translate('actions.reply')}
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

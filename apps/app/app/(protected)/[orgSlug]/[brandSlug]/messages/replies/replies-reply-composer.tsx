'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ReplyIntent } from '@genfeedai/props/messages/replies-page.props';
import type { RepliesReplyComposerProps } from '@genfeedai/props/messages/replies-reply-composer.props';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

const INTENT_VALUES: ReplyIntent[] = [
  'thanks',
  'question',
  'troll',
  'default',
  'spam',
];

/**
 * Inline reply composer for one inbox comment, built from the shared
 * prompt-bar pieces: intent and AI draft on the left, send on the right.
 */
export default function RepliesReplyComposer({
  authorUsername,
  draft,
  intent,
  isBusy,
  onDraft,
  onDraftChange,
  onIntentChange,
  onSend,
}: RepliesReplyComposerProps) {
  const translate = useTranslations('common.automation.replies');
  const hasDraft = Boolean(draft.trim());

  const handleSubmit = () => {
    if (hasDraft && !isBusy) {
      onSend();
    }
  };

  return (
    <PromptBarComposer density="compact">
      <PromptEditor
        ariaLabel={`Reply to @${authorUsername.replace(/^@/, '')}`}
        className="min-h-12"
        onSubmit={handleSubmit}
        onValueChange={onDraftChange}
        placeholder={translate('composer.placeholder')}
        value={draft}
      />
      <PromptBarToolbar
        density="compact"
        leading={
          <>
            <PromptBarCompactSelect
              ariaLabel={translate('composer.intentLabel')}
              isDisabled={isBusy}
              onChange={(value) => onIntentChange(value as ReplyIntent)}
              options={INTENT_VALUES.map((value) => ({
                label: translate(`composer.intents.${value}`),
                value,
              }))}
              value={intent}
            />
            <Button
              icon={<Sparkles className="size-4" />}
              isDisabled={isBusy}
              onClick={onDraft}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
            >
              {translate('actions.draft')}
            </Button>
          </>
        }
        trailing={
          <PromptBarSendButton
            ariaLabel={translate('actions.send')}
            density="compact"
            isDisabled={isBusy || !hasDraft}
            isLoading={isBusy}
            onClick={onSend}
            tooltip={translate('actions.send')}
          />
        }
      />
    </PromptBarComposer>
  );
}

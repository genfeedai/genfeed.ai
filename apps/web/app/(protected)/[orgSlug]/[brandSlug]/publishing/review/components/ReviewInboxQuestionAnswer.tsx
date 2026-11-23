'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import type { ReviewInboxQuestionAnswerProps } from '@/props/publishing/review-inbox-approvals.props';

/**
 * Answers an agent question in place: one button per option, and a text field
 * when the agent accepts a free answer or offered no options. A question that
 * takes several options is answered in the thread, which has the room for it.
 * A member who can only view the thread sees no control.
 */
export default function ReviewInboxQuestionAnswer({
  item,
  isDisabled,
  onAnswer,
}: ReviewInboxQuestionAnswerProps) {
  const translate = useTranslations('pages.publishing.review.inbox');
  const [text, setText] = useState('');
  const { question } = item;

  if (!question) return null;

  if (!item.isResolvable) {
    return (
      <span className="break-words text-xs text-muted-foreground">
        {translate('questionNotAnswerable')}
      </span>
    );
  }

  if (question.isMultiSelect) {
    return (
      <span className="break-words text-xs text-muted-foreground">
        {translate('questionMultiSelect')}
      </span>
    );
  }

  const hasOptions = question.options.length > 0;
  const takesText = question.allowFreeText || !hasOptions;
  const trimmed = text.trim();

  const submitText = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || isDisabled) return;
    void onAnswer(item, { answer: trimmed }).then(() => setText(''));
  };

  return (
    <span className="flex min-w-0 flex-col gap-2">
      {hasOptions ? (
        <span className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <Button
              isDisabled={isDisabled}
              key={option.id}
              label={option.label}
              onClick={() => {
                void onAnswer(item, {
                  answer: option.label,
                  optionIds: [option.id],
                });
              }}
              size={ButtonSize.SM}
              tooltip={option.description ?? undefined}
              variant={ButtonVariant.SECONDARY}
            />
          ))}
        </span>
      ) : null}
      {takesText ? (
        <Form
          className="flex min-w-0 flex-row items-center gap-2"
          onSubmit={submitText}
          spacing="none"
        >
          <Input
            aria-label={translate('questionAnswerLabel')}
            isDisabled={isDisabled}
            onChange={(event) => setText(event.target.value)}
            placeholder={translate('questionAnswerPlaceholder')}
            value={text}
          />
          <Button
            isDisabled={isDisabled || !trimmed}
            label={translate('questionSend')}
            size={ButtonSize.SM}
            type="submit"
            variant={ButtonVariant.DEFAULT}
          />
        </Form>
      ) : null}
    </span>
  );
}

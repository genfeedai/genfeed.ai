'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { GROK_FEEDBACK_QUESTIONS } from '@hooks/pages/use-post-detail/use-post-detail-state';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { SelectField } from '@ui/primitives/select';
import { MessageSquarePlus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useState } from 'react';

export interface PostDetailThreadFooterProps {
  /** X: replies and the closing @grok question. */
  canAddThread: boolean;
  /** Platforms with a first comment (YouTube, Instagram, LinkedIn, …). */
  canAddFirstComment: boolean;
  isLastChildGrokTweet: boolean;
  /** Text of the closing @grok post, when there is one. */
  grokQuestion: string | null;
  isTogglingGrok: boolean;
  isTogglingFirstComment: boolean;
  firstCommentPost: IPost | null;
  childDescriptions: Map<string, string>;
  handleAddToThread: () => Promise<void>;
  handleToggleGrokFeedback: (
    checked: boolean,
    question?: string,
  ) => Promise<void>;
  handleSetGrokQuestion: (question: string) => Promise<void>;
  handleToggleFirstComment: (checked: boolean) => Promise<void>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  setChildDescription: (childId: string, value: string) => void;
  performAutoSaveForPost: (postId: string) => Promise<void>;
  autoSaveRefs: {
    currentDescriptions: React.MutableRefObject<Map<string, string>>;
    timeouts: React.MutableRefObject<Map<string, NodeJS.Timeout>>;
  };
}

/**
 * The end of the thread: on X, add a reply or close with an @grok question;
 * elsewhere, the first comment hangs off the post. Replaces the old
 * "Thread extras" card.
 */
export default function PostDetailThreadFooter({
  canAddThread,
  canAddFirstComment,
  isLastChildGrokTweet,
  grokQuestion,
  isTogglingGrok,
  isTogglingFirstComment,
  firstCommentPost,
  childDescriptions,
  handleAddToThread,
  handleToggleGrokFeedback,
  handleSetGrokQuestion,
  handleToggleFirstComment,
  handleUpdateChild,
  setChildDescription,
  performAutoSaveForPost,
  autoSaveRefs,
}: PostDetailThreadFooterProps) {
  const translate = useTranslations('pages.posts.detail.threadFooter');
  const [activeTab, setActiveTab] = useState<'reply' | 'grok'>('reply');
  const [pendingQuestion, setPendingQuestion] = useState<string>(
    GROK_FEEDBACK_QUESTIONS[0] ?? '',
  );
  const question =
    isLastChildGrokTweet && grokQuestion ? grokQuestion : pendingQuestion;

  if (!canAddThread && !canAddFirstComment) {
    return null;
  }

  if (canAddThread) {
    return (
      <div className="ml-4 border-l border-border-strong pl-4">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="px-2 pt-2">
            <Tabs
              activeTab={activeTab}
              ariaLabel={translate('ariaLabel')}
              fullWidth={false}
              listClassName="mr-auto"
              items={[
                { id: 'reply', label: translate('replyTab') },
                {
                  id: 'grok',
                  label: isLastChildGrokTweet
                    ? translate('grokTabOn')
                    : translate('grokTab'),
                },
              ]}
              onTabChange={(tab) =>
                setActiveTab(tab === 'grok' ? 'grok' : 'reply')
              }
            />
          </div>
          {activeTab === 'reply' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
              <p className="text-xs text-muted-foreground">
                {translate('replyHint')}
              </p>
              <Button
                label={translate('addReply')}
                icon={<Plus className="size-4" />}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                textTransform="none"
                onClick={() => void handleAddToThread()}
              />
            </div>
          ) : (
            <div className="grid gap-3 p-3">
              <Checkbox
                name="grok-feedback-request"
                label={translate('grokFeedbackLabel')}
                isChecked={isLastChildGrokTweet}
                isDisabled={isTogglingGrok}
                onChange={(event) =>
                  void handleToggleGrokFeedback(event.target.checked, question)
                }
              />
              <SelectField
                name="grok-feedback-question"
                aria-label={translate('grokQuestionAria')}
                value={question}
                isDisabled={isTogglingGrok}
                onChange={(event) => {
                  const next = event.target.value;
                  setPendingQuestion(next);
                  if (isLastChildGrokTweet) {
                    void handleSetGrokQuestion(next);
                  }
                }}
              >
                {GROK_FEEDBACK_QUESTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <p className="text-xs text-muted-foreground">
                {translate('grokHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!firstCommentPost) {
    return (
      <div className="ml-4 border-l border-border-strong pl-4">
        <Button
          label={translate('addFirstComment')}
          icon={<MessageSquarePlus className="size-4" />}
          variant={ButtonVariant.SECONDARY}
          textTransform="none"
          className="w-full justify-start border-dashed"
          isLoading={isTogglingFirstComment}
          onClick={() => void handleToggleFirstComment(true)}
        />
      </div>
    );
  }

  return (
    <div className="ml-4 border-l border-border-strong pl-4">
      <section
        aria-label={translate('firstComment')}
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        <div className="flex items-center gap-2 py-2 pl-3 pr-2">
          <p className="text-xs font-semibold">{translate('firstComment')}</p>
          <p className="text-xs text-muted-foreground">
            {translate('firstCommentHint')}
          </p>
          <Button
            label={translate('remove')}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            textTransform="none"
            className="ml-auto"
            isDisabled={isTogglingFirstComment}
            onClick={() => void handleToggleFirstComment(false)}
          />
        </div>
        <LazyRichTextEditor
          value={
            childDescriptions.get(firstCommentPost.id) ??
            firstCommentPost.description ??
            ''
          }
          placeholder={translate('firstCommentPlaceholder')}
          toolbarMode="hidden"
          minHeight={{ desktop: 96, mobile: 72 }}
          onChange={(value) => {
            handleUpdateChild(firstCommentPost.id, { description: value });
            autoSaveRefs.currentDescriptions.current.set(
              firstCommentPost.id,
              value,
            );
            setChildDescription(firstCommentPost.id, value);

            const existingTimeout = autoSaveRefs.timeouts.current.get(
              firstCommentPost.id,
            );
            if (existingTimeout) {
              clearTimeout(existingTimeout);
            }

            const timeout = setTimeout(() => {
              void performAutoSaveForPost(firstCommentPost.id);
            }, 3_000);

            autoSaveRefs.timeouts.current.set(firstCommentPost.id, timeout);
          }}
        />
      </section>
    </div>
  );
}

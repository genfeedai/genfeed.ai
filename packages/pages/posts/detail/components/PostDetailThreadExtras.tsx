'use client';

import type { IPost } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import { Checkbox } from '@ui/primitives/checkbox';
import type React from 'react';

export interface PostDetailThreadExtrasProps {
  canAddThread: boolean;
  canAddFirstComment: boolean;
  isLastChildGrokTweet: boolean;
  isTogglingGrok: boolean;
  isTogglingFirstComment: boolean;
  hasFirstComment: boolean;
  firstCommentPost: IPost | null;
  childDescriptions: Map<string, string>;
  handleToggleGrokFeedback: (checked: boolean) => Promise<void>;
  handleToggleFirstComment: (checked: boolean) => Promise<void>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  setChildDescription: (childId: string, value: string) => void;
  performAutoSaveForPost: (postId: string) => Promise<void>;
  autoSaveRefs: {
    currentDescriptions: React.MutableRefObject<Map<string, string>>;
    timeouts: React.MutableRefObject<Map<string, NodeJS.Timeout>>;
  };
}

export default function PostDetailThreadExtras({
  canAddThread,
  canAddFirstComment,
  isLastChildGrokTweet,
  isTogglingGrok,
  isTogglingFirstComment,
  hasFirstComment,
  firstCommentPost,
  childDescriptions,
  handleToggleGrokFeedback,
  handleToggleFirstComment,
  handleUpdateChild,
  setChildDescription,
  performAutoSaveForPost,
  autoSaveRefs,
}: PostDetailThreadExtrasProps) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-foreground/60">
            Optional engagement boosts
          </p>
          <p className="font-semibold">Thread extras</p>
        </div>
      </div>

      {canAddThread && (
        <Checkbox
          name="grok-feedback-request"
          label={
            <div className="space-y-1">
              <p className="font-medium">Tag @grok for feedback</p>
              <p className="text-xs text-foreground/60">
                Adds a closing tweet asking @grok for input using one of the
                preset prompts.
              </p>
            </div>
          }
          isChecked={isLastChildGrokTweet}
          isDisabled={isTogglingGrok}
          className="size-4 accent-primary"
          onChange={(e) => handleToggleGrokFeedback(e.target.checked)}
        />
      )}

      {canAddFirstComment && (
        <div className="space-y-2">
          <Checkbox
            name="first-comment"
            label={
              <div className="space-y-1">
                <p className="font-medium">Add first comment</p>
                <p className="text-xs text-foreground/60">
                  Creates a first comment for supported platforms so you can add
                  context or links without editing the main post.
                </p>
              </div>
            }
            isChecked={hasFirstComment}
            isDisabled={isTogglingFirstComment}
            className="size-4 accent-primary"
            onChange={(e) => handleToggleFirstComment(e.target.checked)}
          />

          {hasFirstComment && firstCommentPost && (
            <LazyRichTextEditor
              value={
                childDescriptions.get(firstCommentPost.id) ??
                firstCommentPost.description ??
                ''
              }
              placeholder="Enter your first comment..."
              minHeight={{ desktop: 150, mobile: 100 }}
              onChange={(value) => {
                handleUpdateChild(firstCommentPost.id, {
                  description: value,
                });
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
                  performAutoSaveForPost(firstCommentPost.id);
                }, 3_000);

                autoSaveRefs.timeouts.current.set(firstCommentPost.id, timeout);
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}

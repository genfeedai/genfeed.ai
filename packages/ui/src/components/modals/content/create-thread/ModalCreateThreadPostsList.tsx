'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { MAX_THREAD_DELAY_MINUTES } from '@genfeedai/contracts/api-types/contracts';
import type { ModalCreateThreadPostsListProps } from '@genfeedai/props/modals/modal.props';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';

export default function ModalCreateThreadPostsList({
  form,
  fields,
  charLimit,
  isCommentMediaSupported,
  onAddPost,
  onRemovePost,
  onKeyDown,
  onPickMedia,
  onClearMedia,
  onChangeDelay,
}: ModalCreateThreadPostsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Thread Posts</h3>
        <Button
          type="button"
          label="Add comment / post"
          icon={<Plus className="size-4" />}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={onAddPost}
        />
      </div>

      {fields.map((field, index) => {
        const currentLength = Array.from(
          form.watch(`posts.${index}.description`) || '',
        ).length;
        const isOverLimit = currentLength > charLimit;
        const mediaIds = form.watch(`posts.${index}.ingredientIds`) ?? [];
        const isFollowUp = index > 0;

        return (
          <div
            key={field.id}
            className="bg-secondary shadow-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">
                {isFollowUp ? `Comment ${index}` : 'Post'}
              </span>
              {fields.length > 1 && (
                <Button
                  type="button"
                  label="Remove"
                  icon={<Trash2 className="size-4" />}
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  className="text-error"
                  onClick={() => onRemovePost(index)}
                />
              )}
            </div>

            <FormControl
              label={
                <div className="flex items-center justify-between w-full">
                  <span>Content</span>
                  <span
                    className={`text-xs ${isOverLimit ? 'text-error' : 'text-foreground/60'}`}
                  >
                    {currentLength} / {charLimit}
                  </span>
                </div>
              }
              error={form.formState.errors.posts?.[index]?.description?.message}
            >
              <Textarea
                name={`posts.${index}.description`}
                register={form.register(`posts.${index}.description`)}
                placeholder={
                  isFollowUp
                    ? 'Enter the comment posted after the post'
                    : 'Enter content for the post'
                }
                onKeyDown={onKeyDown}
              />
            </FormControl>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                label={mediaIds.length > 0 ? 'Change media' : 'Insert media'}
                icon={<ImageIcon className="size-4" />}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.XS}
                onClick={() => onPickMedia(index)}
                isDisabled={isFollowUp && !isCommentMediaSupported}
              />
              {mediaIds.length > 0 && (
                <>
                  <span className="text-xs text-foreground/60">
                    {mediaIds.length} attached
                  </span>
                  <Button
                    type="button"
                    label="Clear media"
                    icon={<X className="size-3" />}
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.XS}
                    onClick={() => onClearMedia(index)}
                  />
                </>
              )}
            </div>

            {isFollowUp && !isCommentMediaSupported && (
              <p className="text-xs text-foreground/60">
                This channel publishes comments as text only, so a comment here
                cannot carry media.
              </p>
            )}

            {isFollowUp && (
              <FormControl
                label="Delay"
                helpText="Minutes after the post goes live. 0 publishes it right behind the post."
              >
                <Input
                  type="number"
                  min={0}
                  max={MAX_THREAD_DELAY_MINUTES}
                  step={1}
                  value={form.watch(`posts.${index}.threadDelayMinutes`) ?? 0}
                  onChange={(event) => onChangeDelay(index, event.target.value)}
                />
              </FormControl>
            )}
          </div>
        );
      })}
    </div>
  );
}

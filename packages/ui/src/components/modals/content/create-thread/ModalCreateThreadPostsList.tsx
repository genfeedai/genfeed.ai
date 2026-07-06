'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { ModalCreateThreadPostsListProps } from '@genfeedai/props/modals/modal.props';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import { HiPlus, HiTrash } from 'react-icons/hi2';

export default function ModalCreateThreadPostsList({
  form,
  fields,
  charLimit,
  onAddPost,
  onRemovePost,
  onKeyDown,
}: ModalCreateThreadPostsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Thread Posts</h3>
        <Button
          type="button"
          label="Add Post"
          icon={<HiPlus className="size-4" />}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={onAddPost}
        />
      </div>

      {fields.map((field, index) => {
        const currentLength =
          form.watch(`posts.${index}.description`)?.length || 0;
        const isOverLimit = currentLength > charLimit;

        return (
          <div
            key={field.id}
            className="bg-secondary shadow-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Post {index + 1}</span>
              {fields.length > 1 && (
                <Button
                  type="button"
                  label="Remove"
                  icon={<HiTrash className="size-4" />}
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
                placeholder={`Enter content for post ${index + 1}`}
                onKeyDown={onKeyDown}
              />
            </FormControl>
          </div>
        );
      })}
    </div>
  );
}

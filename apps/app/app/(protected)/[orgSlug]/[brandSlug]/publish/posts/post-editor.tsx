'use client';

import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  Platform,
  PostFormat,
  PostStatus,
} from '@genfeedai/enums';
import { getPostStatusOptions } from '@helpers/content/posts.helper';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import type { Post } from '@models/content/post.model';
import type { PostEditorFormState } from '@props/content/artifact-editor.props';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { X_LONG_FORM_CHAR_LIMIT } from '@ui-constants/platform-char-limit.constant';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { type UseFormReturn, useFieldArray } from 'react-hook-form';

export const POST_EDITOR_FORM_ID = 'post-editor-form';

/**
 * Option lists and section copy held as data, mirroring `getPostStatusOptions`,
 * so the labels stay one translatable set instead of inline JSX fragments.
 */
const X_FORMAT_OPTIONS: { label: string; value: PostFormat }[] = [
  { label: 'Standard post', value: PostFormat.STANDARD },
  { label: 'Long post', value: PostFormat.LONG_FORM },
  { label: 'Thread', value: PostFormat.THREAD },
];

const X_STATUS_OPTIONS: { label: string; value: PostStatus }[] = [
  { label: 'Draft', value: PostStatus.DRAFT },
  { label: 'Scheduled', value: PostStatus.SCHEDULED },
];

const COPY = {
  segmentContent: 'Content',
  threadRepliesHint:
    'Replies publish in this order through the existing schedule.',
  threadRepliesTitle: 'Thread replies',
};

type PostEditorProps = {
  form: UseFormReturn<PostEditorFormState>;
  post: Post;
  onSubmit: () => void;
};

/**
 * Post metadata fields, lifted out of the list overlay onto a page of their own
 * so a draft can be refined without the list context around it.
 */
export default function PostEditor({ form, post, onSubmit }: PostEditorProps) {
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const isYouTube = post.platform === Platform.YOUTUBE;
  const isX = post.platform === Platform.TWITTER;
  const format = form.watch('format');
  const isThread = format === PostFormat.THREAD;
  const rootCharacterLimit =
    format === PostFormat.LONG_FORM ? X_LONG_FORM_CHAR_LIMIT : 280;
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    keyName: 'fieldKey',
    name: 'threadSegments',
  });

  return (
    <form
      id={POST_EDITOR_FORM_ID}
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {hasFormErrors(form.formState.errors) && (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">
            {parseFormErrors(form.formState.errors).map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </Alert>
      )}

      <div className="space-y-4">
        <FormControl label="Title" error={form.formState.errors.label?.message}>
          <Input
            name="label"
            control={form.control}
            placeholder="Enter post title"
          />
        </FormControl>

        {isX && (
          <FormControl
            label="Format"
            error={form.formState.errors.format?.message}
            helpText="Long posts use one body; threads publish each segment as a linked reply."
          >
            <SelectField name="format" control={form.control}>
              {X_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </FormControl>
        )}

        <FormControl
          label={
            <div className="flex w-full items-center justify-between gap-2">
              <span>{isThread ? 'Post 1' : 'Description'}</span>
              {isX && (
                <span className="text-xs text-foreground/60">
                  {form.watch('description').length} /{' '}
                  {rootCharacterLimit.toLocaleString()}
                </span>
              )}
            </div>
          }
          error={form.formState.errors.description?.message}
        >
          <Textarea<PostEditorFormState>
            name="description"
            control={form.control}
            placeholder="Enter post description"
            maxLength={isX ? rootCharacterLimit : undefined}
          />
        </FormControl>

        {isThread && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">
                  {COPY.threadRepliesTitle}
                </h3>
                <p className="text-xs text-foreground/60">
                  {COPY.threadRepliesHint}
                </p>
              </div>
              <Button
                type="button"
                withWrapper={false}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                icon={<Plus className="size-4" />}
                label="Add reply"
                onClick={() => append({ description: '' })}
              />
            </div>

            {typeof form.formState.errors.threadSegments?.message ===
              'string' && (
              <p className="text-error text-sm">
                {form.formState.errors.threadSegments.message}
              </p>
            )}

            {fields.map((field, index) => {
              const fieldName = `threadSegments.${index}.description` as const;
              const currentLength = form.watch(fieldName)?.length || 0;

              return (
                <div
                  key={field.fieldKey}
                  className="space-y-2 border-border border-t pt-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">
                      {`Post ${index + 2}`}
                    </span>
                    <Button
                      type="button"
                      withWrapper={false}
                      size={ButtonSize.XS}
                      variant={ButtonVariant.GHOST}
                      icon={<Trash2 className="size-4" />}
                      label="Remove"
                      className="text-error"
                      onClick={() => remove(index)}
                    />
                  </div>
                  <FormControl
                    label={
                      <div className="flex w-full items-center justify-between gap-2">
                        <span>{COPY.segmentContent}</span>
                        <span className="text-xs text-foreground/60">
                          {currentLength} / 280
                        </span>
                      </div>
                    }
                    error={
                      form.formState.errors.threadSegments?.[index]?.description
                        ?.message
                    }
                  >
                    <Textarea<PostEditorFormState>
                      name={fieldName}
                      control={form.control}
                      maxLength={280}
                      placeholder={`Enter content for post ${index + 2}`}
                    />
                  </FormControl>
                </div>
              );
            })}
          </div>
        )}

        <FormControl
          label="Scheduled Date"
          error={form.formState.errors.scheduledDate?.message}
        >
          <FormDateTimePicker
            value={form.watch('scheduledDate')}
            timezone={browserTimezone}
            onChange={(value) =>
              form.setValue('scheduledDate', value ? value.toISOString() : '', {
                shouldDirty: true,
              })
            }
          />
        </FormControl>

        {isX && (
          <FormControl
            label="Publishing status"
            error={form.formState.errors.status?.message}
            helpText="Choose Scheduled after selecting a date to use the existing publishing queue."
          >
            <SelectField name="status" control={form.control}>
              {X_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </FormControl>
        )}

        {isYouTube && (
          <FormControl
            label="Status"
            error={form.formState.errors.status?.message}
          >
            <SelectField name="status" control={form.control}>
              {getPostStatusOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </FormControl>
        )}
      </div>
    </form>
  );
}

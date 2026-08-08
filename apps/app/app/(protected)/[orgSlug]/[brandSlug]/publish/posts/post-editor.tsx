'use client';

import { AlertCategory, Platform } from '@genfeedai/enums';
import {
  getPostLifecycleOptions,
  getPostVisibilityOptions,
} from '@helpers/content/posts.helper';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import type { Post } from '@models/content/post.model';
import type { PostEditorFormState } from '@props/content/artifact-editor.props';
import Alert from '@ui/feedback/alert/Alert';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';

export const POST_EDITOR_FORM_ID = 'post-editor-form';

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

        <FormControl
          label="Description"
          error={form.formState.errors.description?.message}
        >
          <Textarea<PostEditorFormState>
            name="description"
            control={form.control}
            placeholder="Enter post description"
          />
        </FormControl>

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

        <FormControl
          label="Lifecycle"
          error={form.formState.errors.targetExecutionState?.message}
        >
          <SelectField name="targetExecutionState" control={form.control}>
            {getPostLifecycleOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </FormControl>

        {isYouTube && (
          <FormControl
            label="Visibility"
            error={form.formState.errors.visibility?.message}
          >
            <SelectField name="visibility" control={form.control}>
              {getPostVisibilityOptions().map((option) => (
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

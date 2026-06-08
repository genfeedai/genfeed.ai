'use client';

import { AlertCategory, Platform } from '@genfeedai/enums';
import { getPostStatusOptions } from '@genfeedai/helpers/content/posts.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { ModalPostSimpleFieldsProps } from '@genfeedai/props/modals/modal.props';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import Alert from '@ui/feedback/alert/Alert';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import PlatformSelector from '@ui/primitives/platform-selector';
import { SelectField } from '@ui/primitives/select';

export default function ModalPostSimpleFields({
  form,
  credentials,
  isEditMode,
  isSubmitting,
  selectedPlatform,
  charLimit,
  currentLength,
  isOverLimit,
  isTitleRequired,
  isTitleError,
  hasIngredients,
  browserTimezone,
  onCredentialSelect,
}: ModalPostSimpleFieldsProps) {
  return (
    <div className="space-y-4">
      {hasFormErrors(form.formState.errors) && (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">
            {parseFormErrors(form.formState.errors).map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </Alert>
      )}

      {!isEditMode && credentials.length > 0 && (
        <FormControl error={form.formState.errors.credential?.message}>
          <PlatformSelector
            credentials={credentials}
            selectedCredentialId={form.watch('credential')}
            onSelect={onCredentialSelect}
            isDisabled={isSubmitting}
          />
        </FormControl>
      )}

      {selectedPlatform !== Platform.TWITTER && (
        <FormControl
          label="Title"
          error={
            isTitleError
              ? 'Title is required for YouTube'
              : form.formState.errors.label?.message
          }
        >
          <Input
            name="label"
            control={form.control}
            placeholder={
              isTitleRequired ? 'Enter YouTube video title' : 'Optional'
            }
          />
        </FormControl>
      )}

      <FormControl
        error={form.formState.errors.description?.message}
        label={
          <div className="flex items-center justify-between w-full gap-2">
            <span>
              {selectedPlatform === Platform.TWITTER ? 'Post' : 'Description'}
            </span>
            <span
              className={`text-xs ${isOverLimit ? 'text-error' : 'text-foreground/60'}`}
            >
              {currentLength} / {charLimit}
            </span>
          </div>
        }
      >
        <LazyRichTextEditor
          value={form.watch('description') || ''}
          onChange={(value) => {
            form.setValue('description', value, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          placeholder="Enter post caption"
          minHeight={{ desktop: 300, mobile: 200 }}
        />
      </FormControl>

      {hasIngredients && (
        <>
          <FormControl
            label="Scheduled Date (Optional)"
            error={form.formState.errors.scheduledDate?.message}
            helpText="Set when content is ready to publish"
          >
            <FormDateTimePicker
              value={form.watch('scheduledDate')}
              timezone={browserTimezone}
              onChange={(value) =>
                form.setValue('scheduledDate', value ? value.toISOString() : '')
              }
            />
          </FormControl>

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
        </>
      )}
    </div>
  );
}

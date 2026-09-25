'use client';

import {
  AlertCategory,
  Platform,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { CHANNEL_CAPABILITIES } from '@genfeedai/contracts/api-types/contracts';
import {
  getPostLifecycleOptions,
  getPostVisibilityOptions,
} from '@genfeedai/helpers/content/posts.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { ModalPostSimpleFieldsProps } from '@genfeedai/props/modals/modal.props';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import Alert from '@ui/feedback/alert/Alert';
import PostDraftGenerator from '@ui/modals/content/post/PostDraftGenerator';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';

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
}: ModalPostSimpleFieldsProps) {
  const translate = useTranslations('ui.postDraft');
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

      {!isEditMode && (
        <FormControl label={translate('platform')}>
          <SelectField
            name="platform"
            control={form.control}
            isDisabled={
              isSubmitting || form.watch('format') === PostFormat.LONG_FORM
            }
            onChange={() => {
              form.setValue('credentialId', '');
              form.setValue('scheduledDate', '');
              form.setValue('targetExecutionState', TargetExecutionState.DRAFT);
            }}
          >
            {CHANNEL_CAPABILITIES.map((channel) => (
              <option key={channel.platform} value={channel.platform}>
                {channel.label}
              </option>
            ))}
          </SelectField>
        </FormControl>
      )}
      {(!isEditMode || !form.watch('credentialId')) && (
        <FormControl
          label={translate('account')}
          error={form.formState.errors.credentialId?.message}
        >
          <SelectField
            name="credentialId"
            onChange={(event) => {
              if (!event.target.value) {
                form.setValue('scheduledDate', '');
                form.setValue(
                  'targetExecutionState',
                  TargetExecutionState.DRAFT,
                  { shouldValidate: true },
                );
              }
            }}
            control={form.control}
            isDisabled={isSubmitting}
          >
            <option value="">{translate('noAccount')}</option>
            {credentials.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label || account.externalHandle || account.platform}
              </option>
            ))}
          </SelectField>
        </FormControl>
      )}
      <PostDraftGenerator
        key={`${selectedPlatform}-${form.watch('format')}`}
        platform={form.watch('platform') ?? Platform.TWITTER}
        format={form.watch('format')}
        isDisabled={isSubmitting}
        onGenerate={(description) =>
          form.setValue('description', description, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      />

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
        {selectedPlatform === Platform.TWITTER ? (
          <Textarea
            name="description"
            aria-label={translate('postContent')}
            value={form.watch('description') || ''}
            onChange={(event) => {
              form.setValue('description', event.target.value, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            placeholder={translate('tweetPlaceholder')}
          />
        ) : (
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
        )}
      </FormControl>

      {form.watch('credentialId') &&
        (hasIngredients || selectedPlatform === Platform.TWITTER) && (
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
                  form.setValue(
                    'scheduledDate',
                    value ? value.toISOString() : '',
                  )
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

            {selectedPlatform === Platform.YOUTUBE && (
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
          </>
        )}
    </div>
  );
}

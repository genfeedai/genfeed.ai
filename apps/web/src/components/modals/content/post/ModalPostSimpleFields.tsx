'use client';

import {
  ButtonSize,
  ButtonVariant,
  Platform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { CHANNEL_CAPABILITIES } from '@genfeedai/contracts/api-types/contracts';
import { getPostVisibilityOptions } from '@genfeedai/helpers/content/posts.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { ModalPostSimpleFieldsProps } from '@genfeedai/props/modals/modal.props';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import BrandRuleProposals from '@/components/brand-rules/BrandRuleProposals';
import LazyRichTextEditor from '@/components/editors/LazyRichTextEditor';
import ModalPostDestinations from '@/components/modals/content/post/ModalPostDestinations';
import ModalPostMedia from '@/components/modals/content/post/ModalPostMedia';
import ModalPostSelectedChannels from '@/components/modals/content/post/ModalPostSelectedChannels';
import PostDraftGenerator from '@/components/modals/content/post/PostDraftGenerator';

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
  composer,
  media,
  onDraftGenerated,
}: ModalPostSimpleFieldsProps) {
  const translate = useTranslations('ui.postDraft');
  const composerTranslate = useTranslations('ui.postComposer');
  // The text the model wrote, tied to the channel and format it was written for
  // so a different channel never compares its draft with another's.
  const generatorKey = `${selectedPlatform}-${form.watch('format')}`;
  const [generated, setGenerated] = useState<{
    key: string;
    text: string;
  } | null>(null);
  // The AI draft is one click away, not a prompt bar on top of the editor.
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const errors = hasFormErrors(form.formState.errors) ? (
    <Alert variant="destructive">
      <div className="space-y-1">
        {parseFormErrors(form.formState.errors).map((error) => (
          <div key={error}>{error}</div>
        ))}
      </div>
    </Alert>
  ) : null;

  // Step one of the composer: only where the post goes.
  if (composer?.step === 'channels') {
    return (
      <div className="space-y-4">
        {errors}
        <ModalPostDestinations
          credentials={composer.credentials}
          selectedCredentialIds={composer.selectedCredentialIds}
          destination={composer.destination}
          isDisabled={isSubmitting}
          onToggleCredential={composer.onToggleCredential}
          onSelectDestination={composer.onSelectDestination}
        />
        {composer.destination ? (
          <p className="text-sm text-foreground/70">
            {composerTranslate('handoff')}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errors}

      {composer ? (
        <ModalPostSelectedChannels
          credentials={composer.credentials}
          selectedCredentialIds={composer.selectedCredentialIds}
          isDisabled={isSubmitting}
          onEdit={composer.onEditChannels}
        />
      ) : null}
      {media ? <ModalPostMedia {...media} /> : null}
      {!isEditMode && !composer && (
        <FormControl label={translate('platform')}>
          <SelectField
            name="platform"
            control={form.control}
            isDisabled={isSubmitting}
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
      {!composer && (!isEditMode || !form.watch('credentialId')) && (
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
      <div className="space-y-4">
        <Button
          icon={<Sparkles className="size-4" />}
          isDisabled={isSubmitting}
          label={composerTranslate(
            isDraftOpen ? 'hideDraftWithAi' : 'draftWithAi',
          )}
          onClick={() => setIsDraftOpen((isOpen) => !isOpen)}
          size={ButtonSize.SM}
          type="button"
          variant={ButtonVariant.GHOST}
        />
        {isDraftOpen ? (
          <PostDraftGenerator
            key={`${selectedPlatform}-${form.watch('format')}`}
            platform={form.watch('platform') ?? Platform.TWITTER}
            format={form.watch('format')}
            isDisabled={isSubmitting}
            onGenerate={(description, draft) => {
              setGenerated({ key: generatorKey, text: description });
              form.setValue('description', description, {
                shouldDirty: true,
                shouldValidate: true,
              });
              onDraftGenerated?.({
                platform: form.getValues('platform') ?? Platform.TWITTER,
                postId: draft.postId,
              });
            }}
          />
        ) : null}

        <div className="space-y-4">
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
                  {selectedPlatform === Platform.TWITTER
                    ? 'Post'
                    : 'Description'}
                </span>
                <span
                  className={`text-xs ${isOverLimit ? 'text-destructive' : 'text-foreground/60'}`}
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

          <BrandRuleProposals
            original={generated?.key === generatorKey ? generated.text : null}
            edited={form.watch('description') || ''}
          />

          {composer?.hasXTarget ? (
            <div className="space-y-1">
              <Switch
                aria-label={composerTranslate('splitIntoThread')}
                label={composerTranslate('splitIntoThread')}
                isChecked={composer.isThread}
                isDisabled={isSubmitting}
                onCheckedChange={composer.onThreadChange}
              />
              <p className="text-xs text-foreground/60">
                {composer.isThread
                  ? composerTranslate('threadCount', {
                      count: composer.threadItemCount,
                    })
                  : composerTranslate('splitIntoThreadHelp')}
              </p>
              {composer.isLongPost ? (
                <p className="text-xs text-foreground/60">
                  {composerTranslate('longPostHelp')}
                </p>
              ) : null}
            </div>
          ) : null}

          {form.watch('credentialId') &&
            selectedPlatform === Platform.YOUTUBE && (
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
      </div>
    </div>
  );
}

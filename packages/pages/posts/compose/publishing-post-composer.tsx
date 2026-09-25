'use client';

import {
  type PostModalSchema,
  postModalSchema,
} from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  Platform,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { CHANNEL_CAPABILITIES } from '@genfeedai/contracts/api-types/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { calculateTweetLength } from '@helpers/formatting/tweet-length/tweet-length.helper';
import { stripHtmlToPlainText } from '@helpers/security/sanitize-html.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { buildPostTargetPreview } from '@pages/posts/detail/post-detail-preview.helpers';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import PostDraftGenerator from '@ui/modals/content/post/PostDraftGenerator';
import TargetPreview from '@ui/previews/TargetPreview';
import { Button } from '@ui/primitives/button';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { resolvePlatformCharLimit } from '@ui-constants/platform-char-limit.constant';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';

export default function PublishingPostComposer() {
  const translate = useTranslations('pages.posts.composer');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { href } = useOrgUrl();
  const { brandId, credentials = [] } = useBrand();
  const notificationsService = NotificationsService.getInstance();
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const requestedPlatform = parsePlatformParam(searchParams?.get('platform'));
  const getPostsService = useAuthedService(
    useCallback((token: string) => PostsService.getInstance(token), []),
  );

  const form = useForm<PostModalSchema>({
    defaultValues: {
      credentialId: '',
      description: '',
      format: PostFormat.STANDARD,
      ingredients: [],
      label: '',
      platform: requestedPlatform ?? Platform.TWITTER,
      scheduledDate: '',
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
    },
    mode: 'onChange',
    resolver: standardSchemaResolver(postModalSchema),
  });

  const selectedPlatform = form.watch('platform') ?? Platform.TWITTER;
  const description = stripHtmlToPlainText(form.watch('description') || '');
  const charLimit = resolvePlatformCharLimit(
    selectedPlatform,
    form.watch('format'),
  );
  const currentLength =
    selectedPlatform === Platform.TWITTER
      ? calculateTweetLength(description)
      : Array.from(description).length;
  const isOverLimit = currentLength > charLimit;
  const platformCredentials = credentials.filter(
    (account) => account.platform === selectedPlatform,
  );
  const selectedCredential = platformCredentials.find(
    (account) => account.id === form.watch('credentialId'),
  );
  const preview = buildPostTargetPreview(
    {
      createdAt: new Date().toISOString(),
      description,
      id: 'new',
      isDeleted: false,
      platform: selectedPlatform,
      updatedAt: new Date().toISOString(),
    } as IPost,
    description,
    selectedCredential,
  );

  const onSubmit = form.handleSubmit(async (formData) => {
    const caption = stripHtmlToPlainText(formData.description);
    try {
      const service = await getPostsService();
      const created = await service.post({
        brandId: brandId || undefined,
        credentialId: formData.credentialId || undefined,
        description: caption,
        format: formData.format,
        ingredients: formData.ingredients || [],
        label: formData.label?.trim() || '',
        platform: formData.platform,
        ...(formData.scheduledDate
          ? { scheduledDate: formData.scheduledDate }
          : {}),
        targetExecutionState: formData.targetExecutionState,
        visibility: formData.visibility,
      });
      notificationsService.success(translate('created'));
      if (created?.id) {
        router.push(href(getPublishingPostHref(created.id)));
      }
    } catch (error) {
      logger.error('Create publishing post failed', error);
      notificationsService.error(translate('failed'));
    }
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-foreground/55">
            {translate('artifactLabel')}
          </p>
          <h1 className="font-semibold text-foreground text-lg">
            {translate('title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {translate('description')}
          </p>
        </div>
        <Button
          form="publishing-post-composer"
          isDisabled={
            form.formState.isSubmitting || isOverLimit || !description
          }
          isLoading={form.formState.isSubmitting}
          label={translate('save')}
          type="submit"
          variant={ButtonVariant.DEFAULT}
        />
      </div>
      <Form id="publishing-post-composer" spacing="section" onSubmit={onSubmit}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-4">
            <FormControl label={translate('platform')}>
              <SelectField
                name="platform"
                control={form.control}
                isDisabled={form.formState.isSubmitting}
                onChange={() => {
                  form.setValue('credentialId', '');
                  form.setValue('scheduledDate', '');
                  form.setValue(
                    'targetExecutionState',
                    TargetExecutionState.DRAFT,
                  );
                }}
              >
                {CHANNEL_CAPABILITIES.map((channel) => (
                  <option key={channel.platform} value={channel.platform}>
                    {channel.label}
                  </option>
                ))}
              </SelectField>
            </FormControl>
            <FormControl label={translate('account')}>
              <SelectField
                name="credentialId"
                control={form.control}
                isDisabled={form.formState.isSubmitting}
              >
                <option value="">{translate('noAccount')}</option>
                {platformCredentials.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label ||
                      account.externalHandle ||
                      account.platform}
                  </option>
                ))}
              </SelectField>
            </FormControl>
            <PostDraftGenerator
              format={form.watch('format')}
              isDisabled={form.formState.isSubmitting}
              platform={selectedPlatform}
              onGenerate={(value) =>
                form.setValue(
                  'description',
                  selectedPlatform === Platform.TWITTER
                    ? stripHtmlToPlainText(value)
                    : value,
                  {
                    shouldDirty: true,
                    shouldValidate: true,
                  },
                )
              }
            />
            <FormControl
              label={
                <div className="flex w-full items-center justify-between gap-2">
                  <span>{translate('post')}</span>
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
                  placeholder={translate('placeholder')}
                  value={description}
                  onChange={(event) =>
                    form.setValue('description', event.target.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              ) : (
                <LazyRichTextEditor
                  value={form.watch('description') || ''}
                  onChange={(value) =>
                    form.setValue('description', value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  placeholder={translate('placeholder')}
                  minHeight={{ desktop: 300, mobile: 200 }}
                />
              )}
            </FormControl>
            {form.watch('credentialId') ? (
              <FormControl label={translate('scheduledDate')}>
                <FormDateTimePicker
                  timezone={browserTimezone}
                  value={form.watch('scheduledDate')}
                  onChange={(value) => {
                    form.setValue(
                      'scheduledDate',
                      value ? value.toISOString() : '',
                    );
                    form.setValue(
                      'targetExecutionState',
                      value
                        ? TargetExecutionState.SCHEDULED
                        : TargetExecutionState.DRAFT,
                    );
                  }}
                />
              </FormControl>
            ) : null}
          </div>
          <div>{preview ? <TargetPreview {...preview} /> : null}</div>
        </div>
      </Form>
    </div>
  );
}

function parsePlatformParam(value: string | null): Platform | undefined {
  if (!value) {
    return undefined;
  }
  return Object.values(Platform).find((platform) => platform === value);
}

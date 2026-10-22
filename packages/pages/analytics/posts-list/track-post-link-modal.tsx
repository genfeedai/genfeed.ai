'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { TrackPostLinkModalProps } from '@genfeedai/props/analytics/track-post-link-modal.props';
import { PostAnalyticsService } from '@genfeedai/services/analytics/publication-analytics.service';
import { getErrorMessage } from '@genfeedai/utils/error/error-handler.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

export default function TrackPostLinkModal({
  brandId,
  triggerRef,
  onClose,
  onTracked,
}: TrackPostLinkModalProps) {
  const translate = useTranslations('pages.analytics.trackPost');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const getService = useAuthedService((token: string) =>
    PostAnalyticsService.getInstance(token),
  );
  let isLinkedIn = false;
  try {
    isLinkedIn = new URL(url).hostname.replace(/^www\./, '') === 'linkedin.com';
  } catch {
    /* URL is still being entered. */
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const service = await getService();
      const result = await service.trackLink({
        brandId,
        url: url.trim(),
        ...(isLinkedIn && title.trim() ? { title: title.trim() } : {}),
        ...(isLinkedIn && publishedAt
          ? { publishedAt: new Date(publishedAt).toISOString() }
          : {}),
      });
      onTracked(result);
      onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, translate('error')));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal.Root
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSubmitting) onClose();
      }}
    >
      <Modal.Content
        size="md"
        onCloseAutoFocus={(event) => {
          const trigger = triggerRef?.current;
          if (!trigger?.isConnected) return;
          const closingContent = event.target;
          if (
            document.activeElement !== document.body &&
            closingContent instanceof HTMLElement &&
            !closingContent.contains(document.activeElement)
          )
            return;
          event.preventDefault();
          trigger.focus({ preventScroll: true });
        }}
      >
        <Modal.Header>
          <Modal.Title>{translate('title')}</Modal.Title>
          <Modal.Description>{translate('description')}</Modal.Description>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={submit}>
            <Field label={translate('url')} isRequired>
              <Input
                name="url"
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setError(null);
                }}
                placeholder={translate('urlPlaceholder')}
                isRequired
                isDisabled={isSubmitting}
                maxLength={2048}
                autoFocus
              />
            </Field>
            {isLinkedIn ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {translate('linkedInNotice')}
                </p>
                <Field label={translate('optionalTitle')}>
                  <Input
                    name="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={10000}
                    isDisabled={isSubmitting}
                  />
                </Field>
                <Field
                  label={translate('optionalDate')}
                  helpText={translate('dateHelp')}
                >
                  <Input
                    name="publishedAt"
                    type="datetime-local"
                    value={publishedAt}
                    onChange={(event) => setPublishedAt(event.target.value)}
                    isDisabled={isSubmitting}
                  />
                </Field>
              </>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Modal.Footer>
              <Button
                type="button"
                label={translate('cancel')}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                isDisabled={isSubmitting}
                onClick={onClose}
              />
              <Button
                type="submit"
                label={translate('submit')}
                size={ButtonSize.SM}
                isLoading={isSubmitting}
                isDisabled={isSubmitting || !url.trim()}
              />
            </Modal.Footer>
          </Form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

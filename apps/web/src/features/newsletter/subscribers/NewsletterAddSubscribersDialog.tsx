'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IBrandSubscriberImportSummary } from '@genfeedai/contracts/interfaces';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useNewsletterService } from '@/features/newsletter/hooks/use-newsletter-module';
import type { NewsletterAudienceDialogProps } from '@/features/newsletter/props/newsletter.props';

const TAG_SPLIT_PATTERN = /[,;]/;

/**
 * Add readers by address. With the consent box ticked they join as active;
 * otherwise each gets the confirmation email first (#9724).
 */
export default function NewsletterAddSubscribersDialog({
  brandId,
  onClose,
  onDone,
}: NewsletterAudienceDialogProps) {
  const translate = useTranslations('pages.publishing.newsletter.subscribers');
  const getService = useNewsletterService();
  const [emails, setEmails] = useState('');
  const [tags, setTags] = useState('');
  const [hasConsent, setHasConsent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(): Promise<void> {
    if (!emails.trim() || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      const service = await getService();
      if (!service) return;
      const summary: IBrandSubscriberImportSummary =
        await service.addSubscribers(brandId, {
          emails: [emails],
          hasConsent,
          tags: tags
            .split(TAG_SPLIT_PATTERN)
            .map((tag) => tag.trim())
            .filter(Boolean),
        });
      onDone(summary);
    } catch (cause) {
      logger.error('Newsletter add subscribers failed', cause);
      setError(translate('addFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('addTitle')}</DialogTitle>
          <DialogDescription>{translate('addDescription')}</DialogDescription>
        </DialogHeader>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={translate('emails')} htmlFor="newsletter-add-emails">
            <Textarea
              autoFocus
              id="newsletter-add-emails"
              placeholder={translate('emailsPlaceholder')}
              rows={6}
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
            />
          </Field>
          <Field
            helpText={translate('tagsHelp')}
            htmlFor="newsletter-add-tags"
            label={translate('tags')}
          >
            <Input
              id="newsletter-add-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </Field>
          <Checkbox
            isChecked={hasConsent}
            label={translate('consentManual')}
            onCheckedChange={(checked) => setHasConsent(checked === true)}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              isDisabled={isSaving}
              label={translate('cancel')}
              onClick={onClose}
              type="button"
              variant={ButtonVariant.GHOST}
            />
            <Button
              isDisabled={!emails.trim()}
              isLoading={isSaving}
              label={
                hasConsent ? translate('addNow') : translate('addAndConfirm')
              }
              type="submit"
              variant={ButtonVariant.DEFAULT}
            />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

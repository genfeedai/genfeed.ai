'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { BRAND_SUBSCRIBER_IMPORT_MAX_BYTES } from '@genfeedai/contracts/constants';
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
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useState } from 'react';
import { useNewsletterService } from '@/features/newsletter/hooks/use-newsletter-module';
import type {
  NewsletterAudienceDialogProps,
  NewsletterImportFile,
} from '@/features/newsletter/props/newsletter.props';
import NewsletterImportSummary from '@/features/newsletter/subscribers/NewsletterImportSummary';

/**
 * CSV import (#9724): pick a file, preview the counts, then confirm with the
 * consent tick. Nothing is written until the import is confirmed.
 */
export default function NewsletterImportDialog({
  brandId,
  onClose,
  onDone,
}: NewsletterAudienceDialogProps) {
  const translate = useTranslations('pages.publishing.newsletter.subscribers');
  const getService = useNewsletterService();
  const [file, setFile] = useState<NewsletterImportFile | null>(null);
  const [preview, setPreview] = useState<IBrandSubscriberImportSummary | null>(
    null,
  );
  const [hasConsent, setHasConsent] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const picked = event.target.files?.[0];
    setPreview(null);
    setError('');
    if (!picked) return;
    if (picked.size > BRAND_SUBSCRIBER_IMPORT_MAX_BYTES) {
      setFile(null);
      setError(translate('fileTooLarge'));
      return;
    }
    const csv = await picked.text();
    setFile({ csv, name: picked.name });
    setIsWorking(true);
    try {
      const service = await getService();
      if (!service) return;
      setPreview(
        await service.importSubscribers(brandId, {
          csv,
          fileName: picked.name,
          isPreview: true,
        }),
      );
    } catch (cause) {
      logger.error('Newsletter import preview failed', cause);
      setError(translate('importFailed'));
    } finally {
      setIsWorking(false);
    }
  }

  async function confirm(): Promise<void> {
    if (!file || !hasConsent || isWorking) return;
    setIsWorking(true);
    setError('');
    try {
      const service = await getService();
      if (!service) return;
      onDone(
        await service.importSubscribers(brandId, {
          csv: file.csv,
          fileName: file.name,
          hasConsent: true,
          isPreview: false,
        }),
      );
    } catch (cause) {
      logger.error('Newsletter import failed', cause);
      setError(translate('importFailed'));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isWorking) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('importTitle')}</DialogTitle>
          <DialogDescription>
            {translate('importDescription')}
          </DialogDescription>
        </DialogHeader>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <Field label={translate('file')} htmlFor="newsletter-import-file">
            <Input
              accept=".csv,text/csv"
              id="newsletter-import-file"
              type="file"
              onChange={(event) => void handleFile(event)}
            />
          </Field>
          {preview ? <NewsletterImportSummary summary={preview} /> : null}
          <Checkbox
            isChecked={hasConsent}
            label={translate('consentImport')}
            onCheckedChange={(checked) => setHasConsent(checked === true)}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              isDisabled={isWorking}
              label={translate('cancel')}
              onClick={onClose}
              type="button"
              variant={ButtonVariant.GHOST}
            />
            <Button
              isDisabled={!preview || preview.added === 0 || !hasConsent}
              isLoading={isWorking}
              label={translate('importConfirm', { count: preview?.added ?? 0 })}
              type="submit"
              variant={ButtonVariant.DEFAULT}
            />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

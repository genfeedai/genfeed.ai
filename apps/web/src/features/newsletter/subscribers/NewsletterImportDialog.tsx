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
import { type ChangeEvent, useRef, useState } from 'react';
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
  // Each pick gets a number; a slower read or preview from an earlier pick is
  // dropped, so the previewed file is always the one that gets imported.
  const selection = useRef(0);

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const picked = event.target.files?.[0];
    selection.current += 1;
    const current = selection.current;
    setFile(null);
    setPreview(null);
    setError('');
    setIsWorking(false);
    if (!picked) return;
    if (picked.size > BRAND_SUBSCRIBER_IMPORT_MAX_BYTES) {
      setError(translate('fileTooLarge'));
      return;
    }
    setIsWorking(true);
    try {
      const csv = await picked.text();
      const service = await getService();
      if (!service) throw new Error('Newsletter service unavailable');
      const summary = await service.importSubscribers(brandId, {
        csv,
        fileName: picked.name,
        isPreview: true,
      });
      if (current !== selection.current) return;
      setFile({ csv, name: picked.name });
      setPreview(summary);
    } catch (cause) {
      if (current !== selection.current) return;
      logger.error('Newsletter import preview failed', cause);
      setError(translate('importFailed'));
    } finally {
      if (current === selection.current) setIsWorking(false);
    }
  }

  async function confirm(): Promise<void> {
    if (!file || !hasConsent || isWorking) return;
    setIsWorking(true);
    setError('');
    try {
      const service = await getService();
      if (!service) throw new Error('Newsletter service unavailable');
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

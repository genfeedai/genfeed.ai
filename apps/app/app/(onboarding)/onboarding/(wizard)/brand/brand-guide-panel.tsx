'use client';
import { BrandOsRevisionStatus, ButtonVariant } from '@genfeedai/contracts';
import BrandOsSettingsCard from '@genfeedai/pages/brands/components/brand-kit/BrandOsSettingsCard';
import type { BrandGuidePanelProps } from '@genfeedai/props/onboarding/brand-guide.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useBrandGuideScan } from './use-brand-guide-scan';

export default function BrandGuidePanel({
  brandId,
  websiteUrl,
  onWebsiteUrlChange,
  isExiting,
  errorMessage,
  onContinue,
  onSkip,
  onRefreshBrand,
}: BrandGuidePanelProps) {
  const t = useTranslations('pages.onboarding.brand');
  const scan = useBrandGuideScan({ brandId });
  const heading = useRef<HTMLHeadingElement>(null);
  const touched = useRef(false);
  const autoStarted = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (scan.scan?.url && !touched.current) onWebsiteUrlChange(scan.scan.url);
  }, [scan.scan?.url, onWebsiteUrlChange]);
  // A known website is scanned once on first arrival. A stored scan, an
  // in-flight request, a failure or a user-edited field never auto-starts.
  const { phase, scan: storedScan, request, error, start } = scan;
  useEffect(() => {
    if (
      autoStarted.current ||
      touched.current ||
      phase !== 'idle' ||
      storedScan ||
      request ||
      error ||
      !websiteUrl.trim()
    )
      return;
    autoStarted.current = true;
    void start(websiteUrl);
  }, [phase, storedScan, request, error, websiteUrl, start]);
  const status = scan.scan?.status;
  const statusKey =
    status === 'failed' && scan.scan?.errorCode === 'brand_scan.timed_out'
      ? 'timedOut'
      : status;
  const locked =
    Boolean(scan.request) ||
    scan.phase === 'resolving' ||
    scan.phase === 'reconcile-error';
  const active = scan.phase === 'starting' || scan.phase === 'observing';
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">{t('scan.title')}</h1>
      <label htmlFor="brand-guide-website" className="block text-sm">
        {t('fields.website.label')}
      </label>
      <Input
        id="brand-guide-website"
        value={websiteUrl}
        placeholder={t('fields.website.placeholder')}
        isDisabled={locked || isExiting}
        onChange={(event) => {
          touched.current = true;
          onWebsiteUrlChange(event.target.value);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          label={t(scan.scan ? 'scan.rescan' : 'scan.start')}
          isDisabled={
            isExiting ||
            active ||
            scan.phase === 'resolving' ||
            scan.phase === 'reconcile-error' ||
            (!websiteUrl.trim() && !scan.request)
          }
          onClick={() => void scan.start(websiteUrl)}
        />
        {scan.error && (
          <Button
            label={t('scan.retry')}
            isDisabled={isExiting}
            onClick={() =>
              void (scan.phase === 'reconcile-error'
                ? scan.reconcile()
                : scan.start(websiteUrl))
            }
          />
        )}
        <Button
          label={t('scan.reviewExisting')}
          variant={ButtonVariant.SECONDARY}
          onClick={() => heading.current?.focus()}
        />
        <Button
          label={t('scan.manual')}
          variant={ButtonVariant.SECONDARY}
          onClick={() => heading.current?.focus()}
        />
      </div>
      <div aria-live="polite" role="status">
        {statusKey && <p>{t(`scan.${statusKey}`)}</p>}
        {scan.slow && <p>{t('scan.slow')}</p>}
        {scan.error && <p>{t('scan.failed')}</p>}
      </div>
      <section className="space-y-4" aria-labelledby="brand-guide-review">
        <h2
          id="brand-guide-review"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold"
        >
          {t('review.title')}
        </h2>
        <p>{t('review.description')}</p>
        {notice && <p role="status">{notice}</p>}
        <BrandOsSettingsCard
          key={brandId}
          brandId={brandId}
          refreshKey={scan.refreshKey}
          isAutoSaveEnabled
          onRefreshBrand={onRefreshBrand}
          onRevisionSaved={(revision) =>
            setNotice(
              t(
                revision.status === BrandOsRevisionStatus.APPROVED
                  ? 'review.approved'
                  : 'review.saved',
              ),
            )
          }
        />
      </section>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      <p>{t('preview.connectionOptional')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          data-brand-os-navigation={brandId}
          label={t('actions.continue')}
          isDisabled={isExiting}
          onClick={onContinue}
        />
        <Button
          data-brand-os-navigation={brandId}
          label={t('actions.skip')}
          variant={ButtonVariant.SECONDARY}
          isDisabled={isExiting}
          onClick={onSkip}
        />
      </div>
    </div>
  );
}

'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { BrandOsExportPanelProps } from '@/features/brands/props/brand-os-settings.props';

/** The design.md export: download, public link, publish and revoke. */
export default function BrandOsExportPanel({
  exportState,
  exportError,
  currentVersion,
  isPublicationOutdated,
  canManage,
  isBusy,
  isLoading,
  isDirty,
  onRetry,
  onDownload,
  onPublish,
  onRevoke,
}: BrandOsExportPanelProps) {
  const t = useTranslations('pages.brandOsSettings');
  const common = useTranslations('common.actions');
  return (
    <>
      {exportError && (
        <section
          aria-label={t('exportLabel')}
          className="space-y-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-semibold">{t('exportLabel')}</h3>
          <p role="alert" className="text-sm text-destructive">
            {exportError}
          </p>
          <Button
            label={common('retry')}
            isDisabled={isBusy || isLoading}
            variant={ButtonVariant.SECONDARY}
            onClick={onRetry}
          />
        </section>
      )}
      {exportState && (
        <div
          className="space-y-3 border-t border-border pt-4"
          role="region"
          aria-label={t('exportLabel')}
        >
          <h3 className="text-sm font-semibold">
            {t('exportTitle', {
              state: t(`visibility.${exportState.state}`),
            })}
          </h3>
          <p className="text-sm text-muted-foreground">
            {exportState.state === 'unavailable' && exportState.revisionId
              ? t('exportInvalid')
              : t(`export.${exportState.state}`)}
          </p>
          {currentVersion !== undefined && exportState.digest && (
            <p className="text-xs text-muted-foreground">
              {t('downloadVersion', { version: currentVersion })}
            </p>
          )}
          {isPublicationOutdated && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('publicationOutdated')}
            </p>
          )}
          {exportState.publicUrl && (
            <Link
              className="block break-all text-sm underline"
              href={exportState.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('publicLink')}
            </Link>
          )}
          {exportState.revisionUrl && (
            <Link
              className="block break-all text-sm underline"
              href={exportState.revisionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('revisionLink')}
            </Link>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              label={t('download')}
              isDisabled={isBusy || !exportState.digest}
              onClick={onDownload}
            />
            {canManage &&
              exportState.canPublish &&
              exportState.revisionId &&
              exportState.digest &&
              (!exportState.publicUrl || isPublicationOutdated) && (
                <Button
                  label={
                    isPublicationOutdated
                      ? t('updatePublication')
                      : t('publish')
                  }
                  variant={ButtonVariant.SECONDARY}
                  isDisabled={isBusy || isDirty}
                  onClick={() => {
                    if (exportState.revisionId)
                      onPublish(exportState.revisionId);
                  }}
                />
              )}
            {canManage && exportState.publicUrl && (
              <Button
                label={t('revoke')}
                variant={ButtonVariant.SECONDARY}
                isDisabled={isBusy}
                onClick={onRevoke}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

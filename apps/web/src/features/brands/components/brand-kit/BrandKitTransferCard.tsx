'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { BRAND_KIT_BUNDLE_MAX_BYTES } from '@genfeedai/contracts/api-types/contracts/brand-kit-bundle.contract';
import type { IBrandKitImportResult } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useState } from 'react';
import { notifyBrandFontsChanged } from '@/features/brands/hooks/use-brand-fonts';
import type { BrandKitTransferCardProps } from '@/features/brands/props/brand-kit-style.props';

type TransferProblem =
  | 'notZip'
  | 'tooLarge'
  | 'importFailed'
  | 'downloadFailed';

const SKIP_REASONS = new Set([
  'invalid_font',
  'missing_file',
  'unsupported_image',
  'upload_failed',
]);

/**
 * Download the whole brand kit as one ZIP, or import a kit ZIP into this brand
 * (#9710). Both are for owners and admins.
 */
export default function BrandKitTransferCard({
  brandId,
  downloadName,
  onImported,
}: BrandKitTransferCardProps) {
  const t = useTranslations('pages.brandKitSettings.transfer');
  const getService = useAuthedService((token) =>
    BrandsService.getInstance(token),
  );
  const [isBusy, setIsBusy] = useState(false);
  const [problem, setProblem] = useState<TransferProblem | null>(null);
  const [result, setResult] = useState<IBrandKitImportResult | null>(null);

  async function download() {
    setIsBusy(true);
    setProblem(null);
    try {
      const service = await getService();
      const blob = await service.exportKit(brandId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setProblem('downloadFailed');
    } finally {
      setIsBusy(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setResult(null);
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setProblem('notZip');
      return;
    }
    if (file.size > BRAND_KIT_BUNDLE_MAX_BYTES) {
      setProblem('tooLarge');
      return;
    }
    setIsBusy(true);
    setProblem(null);
    try {
      const service = await getService();
      setResult(await service.importKit(brandId, file));
      notifyBrandFontsChanged(brandId);
      onImported();
    } catch {
      setProblem('importFailed');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={ButtonVariant.SECONDARY}
            icon={<Download className="size-3.5" />}
            isDisabled={isBusy}
            onClick={() => void download()}
          >
            {t('download')}
          </Button>
          <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground/40 font-normal leading-normal">
            <span>{t('import')}</span>
            <Input
              aria-label={t('import')}
              className="sr-only"
              type="file"
              accept=".zip,application/zip"
              disabled={isBusy}
              onChange={(event) => {
                void upload(event);
              }}
            />
          </Label>
        </div>
        <p className="text-2xs text-muted-foreground">{t('importHelp')}</p>
        {problem ? (
          <p role="alert" className="text-xs text-destructive">
            {t(problem)}
          </p>
        ) : null}
        {result ? (
          <div role="status" className="flex flex-col gap-1 text-xs">
            <p>
              {t('imported', {
                banners: result.banners.length,
                fonts: result.fontCount,
                logos: result.logos.length,
              })}
            </p>
            {result.skipped.map((skip) => (
              <p key={skip.file} className="text-muted-foreground">
                {t('skipped', {
                  file: skip.file,
                  reason: SKIP_REASONS.has(skip.reason)
                    ? t(`skipReason.${skip.reason}`)
                    : skip.reason,
                })}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

'use client';

import { BRAND_LUT_LIMITS } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandLutSettingsProps } from '@props/pages/brand-detail.props';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useState } from 'react';

type LutStatus = 'uploaded' | 'removed' | 'saved' | 'invalidFile' | 'error';

const BYTES_PER_MB = 1024 * 1024;

export default function BrandLutSettings({
  brand,
  brandId,
  onRefreshBrand,
}: BrandLutSettingsProps) {
  const translate = useTranslations('pages.brandLut');
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<LutStatus | null>(null);
  const getService = useAuthedService((token) =>
    BrandsService.getInstance(token),
  );
  const hasLut = Boolean(brand.lutFileName);

  async function run(
    action: LutStatus,
    task: (service: BrandsService) => Promise<unknown>,
  ) {
    if (isBusy) return;
    setIsBusy(true);
    setStatus(null);
    try {
      await task(await getService());
      await onRefreshBrand();
      setStatus(action);
    } catch {
      setStatus('error');
    } finally {
      setIsBusy(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (
      !file.name.toLowerCase().endsWith('.cube') ||
      file.size === 0 ||
      file.size > BRAND_LUT_LIMITS.MAX_BYTES
    ) {
      setStatus('invalidFile');
      return;
    }
    await run('uploaded', (service) => service.uploadLut(brandId, file));
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">{translate('title')}</h3>
          <p className="text-xs text-muted-foreground">
            {translate('description')}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{translate('file')}</p>
          <p
            className="text-sm text-muted-foreground"
            data-testid="brand-lut-file-name"
          >
            {brand.lutFileName ?? translate('noFile')}
          </p>
          <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground/40 font-normal leading-normal">
            <span>{translate(hasLut ? 'replace' : 'upload')}</span>
            <Input
              id="brand-lut-file"
              aria-label={translate(hasLut ? 'replace' : 'upload')}
              className="sr-only"
              type="file"
              accept=".cube"
              disabled={isBusy}
              onChange={(event) => {
                void upload(event);
              }}
            />
          </Label>
        </div>
        <Switch
          aria-label={translate('enabled')}
          label={translate('enabled')}
          isChecked={brand.isLutEnabled ?? false}
          isDisabled={isBusy || !hasLut}
          onCheckedChange={(isLutEnabled) => {
            void run('saved', (service) =>
              service.updateLut(brandId, { isLutEnabled }),
            );
          }}
        />
        {hasLut && (
          <Button
            label={translate('remove')}
            isDisabled={isBusy}
            onClick={() => {
              void run('removed', (service) => service.removeLut(brandId));
            }}
          />
        )}
        {status && (
          <p
            role={
              status === 'error' || status === 'invalidFile'
                ? 'alert'
                : 'status'
            }
            className="text-sm text-muted-foreground"
          >
            {status === 'invalidFile'
              ? translate(status, {
                  size: BRAND_LUT_LIMITS.MAX_BYTES / BYTES_PER_MB,
                })
              : translate(status)}
          </p>
        )}
      </div>
    </Card>
  );
}

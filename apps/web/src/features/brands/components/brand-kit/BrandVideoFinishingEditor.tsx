'use client';

import {
  BRAND_END_CARD_LIMITS,
  BRAND_END_CARD_MIME_TYPES,
  BRAND_LUT_LIMITS,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useRef, useState } from 'react';
import type { BrandVideoFinishingEditorProps } from '@/features/brands/props/brand-video-kit.props';
import BrandVideoLogoSelect from './BrandVideoLogoSelect';

const POSITIONS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;
const BYTES_PER_MB = 1024 * 1024;

type LutStatus = 'uploaded' | 'removed' | 'invalidFile' | 'error';

function ratioToPercent(ratio: number | undefined): string {
  return ratio === undefined ? '' : String(Math.round(ratio * 10000) / 100);
}

function percentToRatio(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value) / 100;
}

function idOrUndefined(value: string): string | undefined {
  return value === 'none' ? undefined : value;
}

export default function BrandVideoFinishingEditor({
  brand,
  brandId,
  finishing,
  isDisabled,
  onChange,
  onRefreshBrand,
}: BrandVideoFinishingEditorProps) {
  const t = useTranslations('pages.brandVideoKit');
  const getService = useAuthedService((token) =>
    BrandsService.getInstance(token),
  );
  const [isLutBusy, setIsLutBusy] = useState(false);
  // Edits made while a LUT request is in flight must survive its completion.
  const latestFinishing = useRef(finishing);
  latestFinishing.current = finishing;
  const [lutStatus, setLutStatus] = useState<LutStatus | null>(null);
  const { endCard, lut, watermark } = finishing;
  const hasLut = Boolean(brand.lutFileName);

  const endCardAssets = [
    ...(brand.logo ? [brand.logo] : []),
    ...(brand.banner ? [brand.banner] : []),
    ...(brand.references ?? []),
  ].filter(
    (asset, index, all) =>
      all.findIndex((item) => item.id === asset.id) === index &&
      (asset.id === endCard.assetId ||
        BRAND_END_CARD_MIME_TYPES.includes(asset.mimeType ?? '')),
  );
  // Every logo variant can be a mark: a light-background logo for light
  // footage, a monochrome one for livestreams.
  const markAssets = [
    ...(brand.logos ?? (brand.logo ? [brand.logo] : [])),
    ...(brand.references ?? []),
  ].filter(
    (asset, index, all) =>
      all.findIndex((item) => item.id === asset.id) === index,
  );

  function endCardLabel(id: string): string {
    if (id === brand.logo?.id) return t('currentLogo');
    if (id === brand.banner?.id) return t('currentBanner');
    return t('reference', {
      number: (brand.references ?? []).findIndex((item) => item.id === id) + 1,
    });
  }

  function patchWatermark(change: Partial<typeof watermark>) {
    const next = { ...watermark, ...change };
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (next[key] === undefined) Reflect.deleteProperty(next, key);
    }
    onChange({ ...finishing, watermark: next });
  }

  async function runLut(
    action: LutStatus,
    task: (service: BrandsService) => Promise<unknown>,
  ) {
    if (isLutBusy) return;
    setIsLutBusy(true);
    setLutStatus(null);
    try {
      await task(await getService());
      await onRefreshBrand();
      setLutStatus(action);
    } catch {
      setLutStatus('error');
    } finally {
      setIsLutBusy(false);
    }
  }

  async function uploadLut(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (
      !file.name.toLowerCase().endsWith('.cube') ||
      file.size === 0 ||
      file.size > BRAND_LUT_LIMITS.MAX_BYTES
    ) {
      setLutStatus('invalidFile');
      return;
    }
    await runLut('uploaded', (service) => service.uploadLut(brandId, file));
  }

  const isDurationValid =
    endCard.durationSeconds >= BRAND_END_CARD_LIMITS.MIN_DURATION_SECONDS &&
    endCard.durationSeconds <= BRAND_END_CARD_LIMITS.MAX_DURATION_SECONDS;
  const isEndCardImageMissing = endCard.isEnabled && !endCard.assetId;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold">{t('finishing.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('finishing.description')}
          </p>
        </div>

        <Switch
          aria-label={t('finishing.endCard')}
          label={t('finishing.endCard')}
          isChecked={endCard.isEnabled}
          isDisabled={isDisabled}
          onCheckedChange={(isEnabled) =>
            onChange({ ...finishing, endCard: { ...endCard, isEnabled } })
          }
        />
        {endCard.isEnabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('finishing.endCardImage')}
              htmlFor="brand-video-end-card-image"
            >
              <Select
                value={endCard.assetId ?? 'none'}
                disabled={isDisabled}
                onValueChange={(value) => {
                  const { assetId: _previous, ...rest } = endCard;
                  onChange({
                    ...finishing,
                    endCard:
                      value === 'none' ? rest : { ...rest, assetId: value },
                  });
                }}
              >
                <SelectTrigger id="brand-video-end-card-image">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('finishing.noImage')}</SelectItem>
                  {endCard.assetId &&
                    !endCardAssets.some(
                      (asset) => asset.id === endCard.assetId,
                    ) && (
                      <SelectItem value={endCard.assetId}>
                        {t('finishing.savedImage')}
                      </SelectItem>
                    )}
                  {endCardAssets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {endCardLabel(asset.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={t('finishing.endCardSeconds')}
              htmlFor="brand-video-end-card-seconds"
            >
              <Input
                id="brand-video-end-card-seconds"
                type="number"
                min={BRAND_END_CARD_LIMITS.MIN_DURATION_SECONDS}
                max={BRAND_END_CARD_LIMITS.MAX_DURATION_SECONDS}
                step={0.5}
                value={endCard.durationSeconds}
                aria-invalid={!isDurationValid}
                disabled={isDisabled}
                onChange={(event) =>
                  onChange({
                    ...finishing,
                    endCard: {
                      ...endCard,
                      durationSeconds: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            {isEndCardImageMissing ? (
              <p
                role="alert"
                className="text-sm text-destructive sm:col-span-2"
              >
                {t('finishing.endCardImageRequired')}
              </p>
            ) : null}
          </div>
        ) : null}

        <Switch
          aria-label={t('finishing.lut')}
          label={t('finishing.lut')}
          isChecked={lut.isEnabled}
          isDisabled={isDisabled || isLutBusy || !hasLut}
          onCheckedChange={(isEnabled) =>
            onChange({
              ...finishing,
              lut: {
                ...(brand.lutFileName ? { fileName: brand.lutFileName } : {}),
                isEnabled,
              },
            })
          }
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{t('finishing.lutFile')}</p>
          <p className="text-sm text-muted-foreground">
            {brand.lutFileName ?? t('finishing.noLutFile')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm font-normal leading-normal text-muted-foreground hover:border-foreground/40">
              <span>
                {t(hasLut ? 'finishing.replaceLut' : 'finishing.uploadLut')}
              </span>
              <Input
                aria-label={t(
                  hasLut ? 'finishing.replaceLut' : 'finishing.uploadLut',
                )}
                className="sr-only"
                type="file"
                accept=".cube"
                disabled={isDisabled || isLutBusy}
                onChange={(event) => {
                  void uploadLut(event);
                }}
              />
            </Label>
            {hasLut ? (
              <Button
                label={t('finishing.removeLut')}
                isDisabled={isDisabled || isLutBusy}
                onClick={() => {
                  void runLut('removed', async (service) => {
                    await service.removeLut(brandId);
                    onChange({
                      ...latestFinishing.current,
                      lut: { isEnabled: false },
                    });
                  });
                }}
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('finishing.lutUploadHelp')}
          </p>
          {lutStatus ? (
            <p
              role={
                lutStatus === 'error' || lutStatus === 'invalidFile'
                  ? 'alert'
                  : 'status'
              }
              className="text-sm text-muted-foreground"
            >
              {lutStatus === 'invalidFile'
                ? t('finishing.lutInvalidFile', {
                    size: BRAND_LUT_LIMITS.MAX_BYTES / BYTES_PER_MB,
                  })
                : lutStatus === 'uploaded'
                  ? t('finishing.lutUploaded')
                  : lutStatus === 'removed'
                    ? t('finishing.lutRemoved')
                    : t('finishing.lutError')}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <h4 className="text-sm font-medium">{t('finishing.watermark')}</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('finishing.watermarkText')}
              htmlFor="brand-video-watermark-text"
            >
              <Input
                id="brand-video-watermark-text"
                value={watermark.text ?? ''}
                maxLength={120}
                disabled={isDisabled}
                onChange={(event) =>
                  patchWatermark({
                    text: event.target.value.trim()
                      ? event.target.value
                      : undefined,
                  })
                }
              />
            </Field>
            <Field
              label={t('finishing.watermarkPosition')}
              htmlFor="brand-video-watermark-position"
            >
              <Select
                value={watermark.position}
                disabled={isDisabled}
                onValueChange={(value) => {
                  const position = POSITIONS.find((item) => item === value);
                  if (position) patchWatermark({ position });
                }}
              >
                <SelectTrigger id="brand-video-watermark-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((position) => (
                    <SelectItem key={position} value={position}>
                      {t(`options.${position}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <BrandVideoLogoSelect
            assets={markAssets}
            brand={brand}
            id="brand-video-watermark-logo"
            isDisabled={isDisabled}
            label={t('finishing.watermarkLogo')}
            noneLabel={t('finishing.noLogo')}
            onChange={(value) =>
              patchWatermark({ logoId: idOrUndefined(value) })
            }
            value={watermark.logoId ?? 'none'}
          />
          <BrandVideoLogoSelect
            assets={markAssets}
            brand={brand}
            id="brand-video-watermark-light-logo"
            isDisabled={isDisabled}
            label={t('finishing.lightLogo')}
            noneLabel={t('finishing.sameAsDefault')}
            onChange={(value) =>
              patchWatermark({ lightLogoId: idOrUndefined(value) })
            }
            value={watermark.lightLogoId ?? 'none'}
          />
          <BrandVideoLogoSelect
            assets={markAssets}
            brand={brand}
            id="brand-video-watermark-live-logo"
            isDisabled={isDisabled}
            label={t('finishing.liveLogo')}
            noneLabel={t('finishing.sameAsDefault')}
            onChange={(value) =>
              patchWatermark({ liveLogoId: idOrUndefined(value) })
            }
            value={watermark.liveLogoId ?? 'none'}
          />
          <div className="flex flex-col gap-2">
            <Label>
              {t('finishing.watermarkOpacity', {
                percent: Math.round(watermark.opacity * 100),
              })}
            </Label>
            <Slider
              aria-label={t('finishing.watermarkOpacityAria')}
              min={5}
              max={100}
              step={5}
              disabled={isDisabled}
              value={[Math.round(watermark.opacity * 100)]}
              onValueChange={([percent]) =>
                patchWatermark({ opacity: (percent ?? 35) / 100 })
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={t('finishing.size')}
              htmlFor="brand-video-watermark-size"
            >
              <Input
                id="brand-video-watermark-size"
                type="number"
                min={1}
                max={50}
                step={0.1}
                value={ratioToPercent(watermark.sizeRatio)}
                placeholder={t('finishing.automatic')}
                disabled={isDisabled}
                onChange={(event) =>
                  patchWatermark({
                    sizeRatio: percentToRatio(event.target.value),
                  })
                }
              />
            </Field>
            <Field
              label={t('finishing.insetX')}
              htmlFor="brand-video-watermark-inset-x"
            >
              <Input
                id="brand-video-watermark-inset-x"
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={ratioToPercent(watermark.insetXRatio)}
                placeholder={t('finishing.automatic')}
                disabled={isDisabled}
                onChange={(event) =>
                  patchWatermark({
                    insetXRatio: percentToRatio(event.target.value),
                  })
                }
              />
            </Field>
            <Field
              label={t('finishing.insetY')}
              htmlFor="brand-video-watermark-inset-y"
            >
              <Input
                id="brand-video-watermark-inset-y"
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={ratioToPercent(watermark.insetYRatio)}
                placeholder={t('finishing.automatic')}
                disabled={isDisabled}
                onChange={(event) =>
                  patchWatermark({
                    insetYRatio: percentToRatio(event.target.value),
                  })
                }
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('finishing.placementHelp')}
          </p>
        </div>
      </div>
    </Card>
  );
}

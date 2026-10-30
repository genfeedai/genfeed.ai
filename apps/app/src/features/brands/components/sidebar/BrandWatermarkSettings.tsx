'use client';

import type { IBrand } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandWatermarkSettingsProps } from '@props/pages/brand-detail.props';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import BrandWatermarkLogoSelect from '@/features/brands/components/sidebar/BrandWatermarkLogoSelect';

const positions = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

/** An empty field means "not set"; a set one must be a number within the range. */
function isOptionalPercentValid(value: string, min: number, max: number) {
  if (value.trim() === '') return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function percentToRatio(value: string): number | null {
  return value.trim() === '' ? null : Number(value) / 100;
}

function ratioToPercent(ratio: number | null | undefined): string {
  return ratio == null ? '' : String(Math.round(ratio * 10000) / 100);
}

export default function BrandWatermarkSettings({
  brand,
  brandId,
  onRefreshBrand,
}: BrandWatermarkSettingsProps) {
  const translate = useTranslations('pages.brandWatermark');
  const [text, setText] = useState(brand.watermarkText ?? '');
  const [logoId, setLogoId] = useState(brand.watermarkLogoId ?? 'none');
  const [opacity, setOpacity] = useState(
    String(Math.round((brand.watermarkOpacity ?? 0.35) * 100)),
  );
  const [position, setPosition] = useState<
    NonNullable<IBrand['watermarkPosition']>
  >(brand.watermarkPosition ?? 'bottom-right');
  const [sizePercent, setSizePercent] = useState(
    ratioToPercent(brand.watermarkSizeRatio),
  );
  const [insetXPercent, setInsetXPercent] = useState(
    ratioToPercent(brand.watermarkInsetXRatio),
  );
  const [insetYPercent, setInsetYPercent] = useState(
    ratioToPercent(brand.watermarkInsetYRatio),
  );
  const [lightLogoId, setLightLogoId] = useState(
    brand.watermarkLightLogoId ?? 'none',
  );
  const [liveLogoId, setLiveLogoId] = useState(
    brand.watermarkLiveLogoId ?? 'none',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);
  const getService = useAuthedService((token) =>
    BrandsService.getInstance(token),
  );
  const assets = [
    ...(brand.logo ? [brand.logo] : []),
    ...(brand.references ?? []),
  ].filter(
    (asset, index, all) =>
      all.findIndex((item) => item.id === asset.id) === index,
  );
  const validOpacity =
    opacity.trim() !== '' &&
    Number.isFinite(Number(opacity)) &&
    Number(opacity) >= 5 &&
    Number(opacity) <= 100;

  const isPlacementValid =
    isOptionalPercentValid(sizePercent, 1, 50) &&
    isOptionalPercentValid(insetXPercent, 0, 50) &&
    isOptionalPercentValid(insetYPercent, 0, 50);

  async function save() {
    if (isSaving || !validOpacity || !isPlacementValid) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const service = await getService();
      await service.updateWatermark(brandId, {
        watermarkText: text.trim() || null,
        watermarkLogoId: logoId === 'none' ? null : logoId,
        watermarkOpacity: Number(opacity) / 100,
        watermarkPosition: position,
        watermarkSizeRatio: percentToRatio(sizePercent),
        watermarkInsetXRatio: percentToRatio(insetXPercent),
        watermarkInsetYRatio: percentToRatio(insetYPercent),
        watermarkLightLogoId: lightLogoId === 'none' ? null : lightLogoId,
        watermarkLiveLogoId: liveLogoId === 'none' ? null : liveLogoId,
      });
      await onRefreshBrand();
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setIsSaving(false);
    }
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
          <Label htmlFor="brand-watermark-text">{translate('text')}</Label>
          <Input
            id="brand-watermark-text"
            value={text}
            maxLength={120}
            onChange={(event) => setText(event.target.value)}
            disabled={isSaving}
          />
        </div>
        <BrandWatermarkLogoSelect
          assets={assets}
          brand={brand}
          id="brand-watermark-logo"
          isDisabled={isSaving}
          label={translate('logo')}
          noneLabel={translate('noLogo')}
          onChange={setLogoId}
          value={logoId}
        />
        <BrandWatermarkLogoSelect
          assets={assets}
          brand={brand}
          id="brand-watermark-light-logo"
          isDisabled={isSaving}
          label={translate('lightLogo')}
          noneLabel={translate('sameAsDefault')}
          onChange={setLightLogoId}
          value={lightLogoId}
        />
        <BrandWatermarkLogoSelect
          assets={assets}
          brand={brand}
          id="brand-watermark-live-logo"
          isDisabled={isSaving}
          label={translate('liveLogo')}
          noneLabel={translate('sameAsDefault')}
          onChange={setLiveLogoId}
          value={liveLogoId}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-watermark-opacity">
              {translate('opacity')}
            </Label>
            <Input
              id="brand-watermark-opacity"
              type="number"
              min={5}
              max={100}
              step={1}
              value={opacity}
              onChange={(event) => setOpacity(event.target.value)}
              aria-invalid={!validOpacity}
              disabled={isSaving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-watermark-position">
              {translate('position')}
            </Label>
            <Select
              value={position}
              onValueChange={(value) => {
                const match = positions.find((item) => item === value);
                if (match) setPosition(match);
              }}
              disabled={isSaving}
            >
              <SelectTrigger id="brand-watermark-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {positions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {translate(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-watermark-size">{translate('size')}</Label>
            <Input
              id="brand-watermark-size"
              type="number"
              min={1}
              max={50}
              step={0.1}
              value={sizePercent}
              placeholder={translate('automatic')}
              onChange={(event) => setSizePercent(event.target.value)}
              aria-invalid={!isOptionalPercentValid(sizePercent, 1, 50)}
              disabled={isSaving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-watermark-inset-x">
              {translate('insetX')}
            </Label>
            <Input
              id="brand-watermark-inset-x"
              type="number"
              min={0}
              max={50}
              step={0.1}
              value={insetXPercent}
              placeholder={translate('automatic')}
              onChange={(event) => setInsetXPercent(event.target.value)}
              aria-invalid={!isOptionalPercentValid(insetXPercent, 0, 50)}
              disabled={isSaving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-watermark-inset-y">
              {translate('insetY')}
            </Label>
            <Input
              id="brand-watermark-inset-y"
              type="number"
              min={0}
              max={50}
              step={0.1}
              value={insetYPercent}
              placeholder={translate('automatic')}
              onChange={(event) => setInsetYPercent(event.target.value)}
              aria-invalid={!isOptionalPercentValid(insetYPercent, 0, 50)}
              disabled={isSaving}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {translate('placementHelp')}
        </p>
        <Button
          label={translate('save')}
          onClick={() => void save()}
          isLoading={isSaving}
          isDisabled={isSaving || !validOpacity || !isPlacementValid}
        />
        {status && (
          <p
            role={status === 'error' ? 'alert' : 'status'}
            className="text-sm text-muted-foreground"
          >
            {translate(status)}
          </p>
        )}
      </div>
    </Card>
  );
}

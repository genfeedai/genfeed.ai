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

const positions = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

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

  async function save() {
    if (isSaving || !validOpacity) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const service = await getService();
      await service.updateWatermark(brandId, {
        watermarkText: text.trim() || null,
        watermarkLogoId: logoId === 'none' ? null : logoId,
        watermarkOpacity: Number(opacity) / 100,
        watermarkPosition: position,
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-watermark-logo">{translate('logo')}</Label>
          <Select value={logoId} onValueChange={setLogoId} disabled={isSaving}>
            <SelectTrigger id="brand-watermark-logo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{translate('noLogo')}</SelectItem>
              {logoId !== 'none' &&
                !assets.some((asset) => asset.id === logoId) && (
                  <SelectItem value={logoId}>
                    {translate('savedLogo')}
                  </SelectItem>
                )}
              {assets.map((asset) => (
                <SelectItem key={asset.id} value={asset.id}>
                  {asset.id === brand.logo?.id
                    ? translate('currentLogo')
                    : translate('reference', {
                        number:
                          (brand.references ?? []).findIndex(
                            (reference) => reference.id === asset.id,
                          ) + 1,
                      })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        <Button
          label={translate('save')}
          onClick={() => void save()}
          isLoading={isSaving}
          isDisabled={isSaving || !validOpacity}
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

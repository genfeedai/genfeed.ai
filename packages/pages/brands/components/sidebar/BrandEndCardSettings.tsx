'use client';

import {
  BRAND_END_CARD_LIMITS,
  BRAND_END_CARD_MIME_TYPES,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandEndCardSettingsProps } from '@props/pages/brand-detail.props';
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
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function BrandEndCardSettings({
  brand,
  brandId,
  onRefreshBrand,
}: BrandEndCardSettingsProps) {
  const translate = useTranslations('pages.brandEndCard');
  const [isEnabled, setIsEnabled] = useState(brand.isEndCardEnabled ?? false);
  const [assetId, setAssetId] = useState(brand.endCardAssetId ?? 'none');
  const [duration, setDuration] = useState(
    String(
      brand.endCardDurationSeconds ??
        BRAND_END_CARD_LIMITS.DEFAULT_DURATION_SECONDS,
    ),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);
  const getService = useAuthedService((token) =>
    BrandsService.getInstance(token),
  );
  const assets = [
    ...(brand.logo ? [brand.logo] : []),
    ...(brand.banner ? [brand.banner] : []),
    ...(brand.references ?? []),
  ].filter(
    (asset, index, all) =>
      all.findIndex((item) => item.id === asset.id) === index &&
      (asset.id === brand.endCardAssetId ||
        BRAND_END_CARD_MIME_TYPES.includes(asset.mimeType ?? '')),
  );
  const isDurationValid =
    duration.trim() !== '' &&
    Number.isFinite(Number(duration)) &&
    Number(duration) >= BRAND_END_CARD_LIMITS.MIN_DURATION_SECONDS &&
    Number(duration) <= BRAND_END_CARD_LIMITS.MAX_DURATION_SECONDS;
  const isImageMissing = isEnabled && assetId === 'none';

  async function save() {
    if (isSaving || !isDurationValid || isImageMissing) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const service = await getService();
      await service.updateEndCard(brandId, {
        endCardAssetId: assetId === 'none' ? null : assetId,
        endCardDurationSeconds: Number(duration),
        isEndCardEnabled: isEnabled,
      });
      await onRefreshBrand();
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setIsSaving(false);
    }
  }

  function assetLabel(id: string): string {
    if (id === brand.logo?.id) return translate('currentLogo');
    if (id === brand.banner?.id) return translate('currentBanner');
    return translate('reference', {
      number: (brand.references ?? []).findIndex((item) => item.id === id) + 1,
    });
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
        <Switch
          aria-label={translate('enabled')}
          label={translate('enabled')}
          isChecked={isEnabled}
          isDisabled={isSaving}
          onCheckedChange={setIsEnabled}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-end-card-image">{translate('image')}</Label>
          <Select
            value={assetId}
            onValueChange={setAssetId}
            disabled={isSaving}
          >
            <SelectTrigger id="brand-end-card-image">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{translate('noImage')}</SelectItem>
              {assetId !== 'none' &&
                !assets.some((asset) => asset.id === assetId) && (
                  <SelectItem value={assetId}>
                    {translate('savedImage')}
                  </SelectItem>
                )}
              {assets.map((asset) => (
                <SelectItem key={asset.id} value={asset.id}>
                  {assetLabel(asset.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-end-card-duration">
            {translate('duration')}
          </Label>
          <Input
            id="brand-end-card-duration"
            type="number"
            min={BRAND_END_CARD_LIMITS.MIN_DURATION_SECONDS}
            max={BRAND_END_CARD_LIMITS.MAX_DURATION_SECONDS}
            step={0.5}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            aria-invalid={!isDurationValid}
            disabled={isSaving}
          />
        </div>
        <Button
          label={translate('save')}
          onClick={() => void save()}
          isLoading={isSaving}
          isDisabled={isSaving || !isDurationValid || isImageMissing}
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

'use client';

import type { IAsset } from '@genfeedai/contracts/interfaces';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import type { BrandVideoLogoSelectProps } from '@/features/brands/props/brand-video-kit.props';

/** One choice of brand image for a watermark mark. `none` is the empty choice. */
export default function BrandVideoLogoSelect({
  assets,
  brand,
  id,
  isDisabled,
  label,
  noneLabel,
  onChange,
  value,
}: BrandVideoLogoSelectProps) {
  const t = useTranslations('pages.brandVideoKit');
  const translateSlot = useTranslations('pages.brandKitSettings.slots');
  const logoIds = new Set((brand.logos ?? []).map((logo) => logo.id));

  function labelFor(asset: IAsset): string {
    if (logoIds.has(asset.id) && asset.kitSlot) {
      return t('logoVariant', {
        variant: translateSlot(`slot.${asset.kitSlot}`),
      });
    }
    if (asset.id === brand.logo?.id) return t('currentLogo');
    return t('reference', {
      number:
        (brand.references ?? []).findIndex(
          (reference) => reference.id === asset.id,
        ) + 1,
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={isDisabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{noneLabel}</SelectItem>
          {value !== 'none' && !assets.some((asset) => asset.id === value) && (
            <SelectItem value={value}>{t('savedLogo')}</SelectItem>
          )}
          {assets.map((asset) => (
            <SelectItem key={asset.id} value={asset.id}>
              {labelFor(asset)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

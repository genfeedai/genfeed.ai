'use client';

import type { BrandWatermarkLogoSelectProps } from '@props/pages/brand-detail.props';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';

/** One choice of brand image for a watermark mark. `none` is the empty choice. */
export default function BrandWatermarkLogoSelect({
  assets,
  brand,
  id,
  isDisabled,
  label,
  noneLabel,
  onChange,
  value,
}: BrandWatermarkLogoSelectProps) {
  const translate = useTranslations('pages.brandWatermark');

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
            <SelectItem value={value}>{translate('savedLogo')}</SelectItem>
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
  );
}

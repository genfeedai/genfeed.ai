'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { GenerationBrandMode } from '@genfeedai/contracts/interfaces/content/generation-harness.interface';
import type { BrandModeBadgeProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import Badge from '@ui/display/badge/Badge';
import { useTranslations } from 'next-intl';

const BRAND_MODE_VARIANTS: Record<
  GenerationBrandMode,
  'success' | 'warning' | 'slate'
> = {
  approved_brand: 'success',
  provisional_brand: 'warning',
  raw: 'slate',
};

/**
 * How a media generation treated the brand. The label is always text, so
 * color is never the only signal: "Not branded" is a raw prompt, "Provisional
 * brand" is an unapproved draft kit and is never compliant.
 */
export default function BrandModeBadge({
  brandMode,
  className,
}: BrandModeBadgeProps) {
  const translate = useTranslations('ui.generationHarness.brandMode');

  if (!brandMode) {
    return null;
  }

  return (
    <Badge
      className={className}
      size={ComponentSize.SM}
      variant={BRAND_MODE_VARIANTS[brandMode]}
    >
      {translate(brandMode)}
    </Badge>
  );
}

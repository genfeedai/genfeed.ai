'use client';

import type { GenerationBrandMode } from '@genfeedai/contracts/interfaces/content/generation-harness.interface';
import type { BrandModeBadgeProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';

const BRAND_MODE_VARIANTS: Record<
  GenerationBrandMode,
  'success' | 'warning' | 'secondary'
> = {
  approved_brand: 'success',
  provisional_brand: 'warning',
  raw: 'secondary',
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
    <Badge className={className} variant={BRAND_MODE_VARIANTS[brandMode]}>
      {translate(brandMode)}
    </Badge>
  );
}

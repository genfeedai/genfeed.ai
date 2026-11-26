'use client';

import { ButtonSize, ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { BrandRequiredStateProps } from '@/props/states/brand-required-state.props';

/**
 * The one answer for a page that works on a brand while none is selected (or
 * while the selected one is still loading): Automation, Content runs, New
 * Program, Content team and Analytics breakouts all show this, in the same
 * words. It sits in the page body, centered, with no card, and leaves the
 * topbar and sidebar alone so the brand switcher stays one click away.
 */
export default function BrandRequiredState({
  brandSettingsHref,
  isLoading = false,
}: BrandRequiredStateProps) {
  const translate = useTranslations('common.brandRequired');

  return (
    <EmptyState
      actions={
        brandSettingsHref && !isLoading ? (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={brandSettingsHref}>{translate('manageBrands')}</Link>
          </Button>
        ) : undefined
      }
      className="mx-auto max-w-md"
      description={isLoading ? undefined : translate('description')}
      size={CardEmptySize.LG}
      title={isLoading ? translate('loading') : translate('title')}
    />
  );
}

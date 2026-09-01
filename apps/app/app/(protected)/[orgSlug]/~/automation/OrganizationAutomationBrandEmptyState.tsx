'use client';

import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Workflow } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface OrganizationAutomationBrandEmptyStateProps {
  orgSlug: string;
}

/**
 * Brandless state for the deeper Automation surfaces.
 *
 * Keeping the requested URL mounted lets the sidebar remain navigable and lets
 * the top-bar brand switcher reopen the same surface for the selected brand.
 */
export default function OrganizationAutomationBrandEmptyState({
  orgSlug,
}: OrganizationAutomationBrandEmptyStateProps) {
  const translate = useTranslations('common.automation.brandEmpty');

  return (
    <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
      <Workflow className="size-10 text-foreground/20" />
      <h1 className="text-lg font-semibold text-foreground">
        {translate('title')}
      </h1>
      <p className="max-w-md text-sm text-foreground/55">
        {translate('description')}
      </p>
      <Button asChild size={ButtonSize.SM} variant={ButtonVariant.SECONDARY}>
        <Link
          href={createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.BRANDS)}
        >
          {translate('action')}
        </Link>
      </Button>
    </div>
  );
}

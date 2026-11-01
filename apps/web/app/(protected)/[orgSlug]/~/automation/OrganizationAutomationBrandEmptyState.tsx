'use client';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Workflow } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { OrganizationAutomationBrandEmptyStateProps } from '@/features/automation/props/organization-automation-brand-empty-state.props';

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
    <EmptyState
      surface="card"
      actions={
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.SECONDARY}>
          <Link
            href={createOrganizationAppRoute(
              orgSlug,
              APP_ROUTES.SETTINGS.BRANDS,
            )}
          >
            {translate('action')}
          </Link>
        </Button>
      }
      className="mx-auto max-w-xl"
      description={translate('description')}
      icon={Workflow}
      title={translate('title')}
    />
  );
}

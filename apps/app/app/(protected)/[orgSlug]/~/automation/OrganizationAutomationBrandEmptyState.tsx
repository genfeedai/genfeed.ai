import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Workflow } from 'lucide-react';
import Link from 'next/link';

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
  return (
    <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 px-6 text-center">
      <Workflow className="size-10 text-foreground/20" />
      <h1 className="text-lg font-semibold text-foreground">
        Select a brand to use Automation
      </h1>
      <p className="max-w-md text-sm text-foreground/55">
        Choose a brand from the top bar to open this Automation page. Your
        current destination will stay selected when you switch brands.
      </p>
      <Button asChild size={ButtonSize.SM} variant={ButtonVariant.SECONDARY}>
        <Link
          href={createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.BRANDS)}
        >
          Manage brands
        </Link>
      </Button>
    </div>
  );
}

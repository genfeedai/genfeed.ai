import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';

export default async function AutomationWizardRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    `${createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.AUTOMATION.AGENTS)}?add=custom`,
  );
}

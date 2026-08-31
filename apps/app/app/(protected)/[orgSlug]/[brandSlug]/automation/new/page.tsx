import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/** Legacy `/automation/new` → Add agent modal in custom mode. */
export default async function AutomationNewAgentLegacyRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    `${createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.AUTOMATION.AGENTS)}?add=custom`,
  );
}

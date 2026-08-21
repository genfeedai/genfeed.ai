import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/** Legacy `/automate/new` → Add agent modal in custom mode. */
export default async function AutomateNewAgentLegacyRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    `${createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.AUTOMATE.AGENTS)}?add=custom`,
  );
}

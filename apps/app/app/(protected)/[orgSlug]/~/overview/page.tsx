import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Legacy org overview path. Workspace home is the complete
 * `/workspace/overview` path for brand and brand-less scopes alike.
 */
export default async function OrgOverviewLegacyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  permanentRedirect(
    createOrganizationAppRoute(orgSlug, APP_ROUTES.WORKSPACE.OVERVIEW),
  );
}

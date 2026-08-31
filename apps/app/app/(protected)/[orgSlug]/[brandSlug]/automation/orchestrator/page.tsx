import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

export default async function ContentTeamOrchestratorRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    `${createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.AUTOMATION.CAMPAIGNS_NEW)}?template=creator-studio`,
  );
}

import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Legacy dead route — `/settings/organization/credentials` never shipped a page.
 * Brand OAuth (Facebook for Meta Ads, Google Ads, social platforms) lives at
 * brand Settings → Social.
 */
export default async function BrandOrganizationCredentialsLegacyRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.SETTINGS.SOCIAL),
  );
}

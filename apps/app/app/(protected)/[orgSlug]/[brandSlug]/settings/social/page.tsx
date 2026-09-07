import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/**
 * `/settings/social` moved to `/settings/integrations`. Keep this redirect so
 * old links and bookmarks still land on the current page.
 */
export default async function BrandSettingsSocialRedirectPage({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;
  redirect(createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.SETTINGS.SOCIAL));
}

import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/**
 * Bare `/:org/:brand/settings` is the settings shell, not a page. Profile is
 * the brand's settings home.
 */
export default async function BrandSettingsIndexPage({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;
  redirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.SETTINGS.PROFILE),
  );
}

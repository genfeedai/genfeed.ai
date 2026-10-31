import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/**
 * Bare `/:org/:brand` is not a product surface. Land on the existing brand
 * home (Workspace), which then completes to Overview — same destination as
 * org landing when a brand is already selected.
 */
export default async function BrandIndexPage({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;
  redirect(createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.ROOT));
}

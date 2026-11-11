import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/** The bare brand Connectors path opens its first section. */
export default async function BrandConnectorsRootPage({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;
  redirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.CONNECTORS.AGENTS),
  );
}

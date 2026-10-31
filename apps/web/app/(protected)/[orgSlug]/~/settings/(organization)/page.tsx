import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

export default async function OrganizationSettingsIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.GENERAL));
}

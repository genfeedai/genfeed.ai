import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type { ConnectorsRootPageProps } from '@genfeedai/props/pages/connectors.props';
import { redirect } from 'next/navigation';

/** The bare Connectors path opens its first section. */
export default async function ConnectorsRootPage({
  params,
}: ConnectorsRootPageProps) {
  const { orgSlug } = await params;
  redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.CONNECTORS.AGENTS));
}

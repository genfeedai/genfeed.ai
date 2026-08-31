import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Legacy Automation "Analytics" was a brand overview clone (posts/views/accounts).
 * Analytics is the single measurement home — permanently fold into it.
 */
export default async function AutomationAnalyticsRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.ANALYTICS.OVERVIEW),
  );
}

import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/**
 * `/library/knowledge` moved to `/settings/knowledge`. Keep this redirect so
 * old links and bookmarks still land on the current page.
 */
export default async function LibraryKnowledgeRedirectPage({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;
  redirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.SETTINGS.KNOWLEDGE),
  );
}

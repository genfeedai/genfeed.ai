import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Links');

/**
 * External links live on Brand Profile (list + ModalBrandLink).
 * Keep this route as a permanent redirect for old bookmarks/menu links.
 */
export default async function BrandSettingsLinksRoute({
  params,
}: {
  params: Promise<{ orgSlug: string; brandSlug: string }>;
}) {
  const { orgSlug, brandSlug } = await params;
  redirect(`/${orgSlug}/${brandSlug}${APP_ROUTES.SETTINGS.ROOT}`);
}

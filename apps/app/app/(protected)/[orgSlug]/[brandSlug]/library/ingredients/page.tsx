import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

interface LibraryIngredientsPageProps {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}

export default async function LibraryIngredientsPage({
  params,
}: LibraryIngredientsPageProps) {
  const { brandSlug, orgSlug } = await params;

  redirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.LIBRARY.OVERVIEW),
  );
}

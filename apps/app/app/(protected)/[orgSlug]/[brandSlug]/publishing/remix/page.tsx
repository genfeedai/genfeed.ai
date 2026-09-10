import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { PostsRemixPageProps } from '@props/publishing/posts-remix-page.props';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Remix');

export default async function PostsRemixPage({ params }: PostsRemixPageProps) {
  const { brandSlug, orgSlug } = await params;
  redirect(`/${orgSlug}/${brandSlug}${APP_ROUTES.STUDIO.GENERATE}`);
}

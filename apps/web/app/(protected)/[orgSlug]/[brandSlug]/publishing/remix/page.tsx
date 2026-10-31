import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';
import type { PostsRemixPageProps } from '@/features/posts/props/posts-remix-page.props';

export const generateMetadata = createPageMetadata('Remix');

export default async function PostsRemixPage({ params }: PostsRemixPageProps) {
  const { brandSlug, orgSlug } = await params;
  redirect(`/${orgSlug}/${brandSlug}${APP_ROUTES.STUDIO.PLAYGROUND}`);
}

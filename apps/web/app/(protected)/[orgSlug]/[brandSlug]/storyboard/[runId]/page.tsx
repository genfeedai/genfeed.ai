import StudioStoryboardRunRoute from '@app/(protected)/[orgSlug]/[brandSlug]/storyboard/[runId]/StudioStoryboardRunRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandLoader from '@ui/feedback/brand-loader/BrandLoader';
import { Suspense } from 'react';
import type { StoryboardRunPageProps } from '@/props/pages/page.props';

export const generateMetadata = createPageMetadata('Storyboard run');

export default function StudioStoryboardRunPage({
  params,
}: StoryboardRunPageProps) {
  return (
    <Suspense fallback={<BrandLoader />}>
      <StudioStoryboardRunRoute params={params} />
    </Suspense>
  );
}

import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { CampaignDetailShell } from '@pages/campaigns';
import { Suspense } from 'react';
import type { PostsListSearchParams } from '../../../publishing-list-page';
import { renderPostsListPage } from '../../../publishing-list-page';

export const generateMetadata = createPageMetadata('Campaign Content');

export default async function PublishingCampaignContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: PostsListSearchParams;
}) {
  const { id } = await params;
  const postsListPage = await renderPostsListPage({
    campaignId: id,
    searchParams,
    scope: PageScope.PUBLISHING,
  });

  return (
    <Suspense fallback={null}>
      <CampaignDetailShell campaignId={id} section="content">
        {postsListPage}
      </CampaignDetailShell>
    </Suspense>
  );
}

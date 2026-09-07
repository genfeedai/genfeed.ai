import type { PostsListSearchParams } from '@props/publishing/publishing-list-page.props';

export type OrgRootAppPageProps = {
  params: Promise<{
    orgRootApp: string;
    orgSlug: string;
    segments?: string[];
  }>;
  searchParams?: PostsListSearchParams;
};

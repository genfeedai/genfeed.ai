import type { PostsListSearchParams } from '@props/publishing/publishing-list-page.props';

/**
 * Publishing reads a fixed set of keys; the Library keeps its filters
 * (`categories`, `folder`, `tags`, …) in the query too, so the page accepts
 * any key.
 */
export type OrgRootAppSearchParams = Promise<
  Awaited<PostsListSearchParams> & Record<string, string | string[] | undefined>
>;

export type OrgRootAppPageProps = {
  params: Promise<{
    orgRootApp: string;
    orgSlug: string;
    segments?: string[];
  }>;
  searchParams?: OrgRootAppSearchParams;
};

'use client';

import ArticleEditorContent from '@app/(protected)/[orgSlug]/[brandSlug]/edit/article/[id]/content';
import NewsletterEditorContent from '@app/(protected)/[orgSlug]/[brandSlug]/edit/newsletter/[id]/content';
import type { ArtifactEditorType } from '@genfeedai/constants';
import { PageScope } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import PostDetail from '@pages/posts/detail/post-detail';
import { ArticlesService } from '@services/content/articles.service';
import { NewslettersService } from '@services/content/newsletters.service';
import { PostsService } from '@services/content/posts.service';
import { useQuery } from '@tanstack/react-query';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import type { ReactElement } from 'react';
import ArtifactEditorShell from '../../../edit/artifact-editor-shell';
import {
  type PublishContentKind,
  resolvePublishContentKindFromId,
} from './resolve-publish-content-kind';

export type { PublishContentKind };

interface PublishContentEditorPageProps {
  contentId: string;
}

/**
 * Type-aware content desk under `/publish/posts/:id`.
 *
 * Kind is resolved from the **entity the id belongs to** (post / article /
 * newsletter services). There is no shared row with a `type` field — three
 * tables share one desk URL — so we probe identity instead of trusting
 * `?kind=` (which breaks if the user strips the query string).
 */
export default function PublishContentEditorPage({
  contentId,
}: PublishContentEditorPageProps): ReactElement {
  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );
  const getArticlesService = useAuthedService((token: string) =>
    ArticlesService.getInstance(token),
  );
  const getNewslettersService = useAuthedService((token: string) =>
    NewslettersService.getInstance(token),
  );

  const {
    data: contentKind,
    isError,
    isLoading,
  } = useQuery({
    queryFn: async ({ signal }) => {
      const [posts, articles, newsletters] = await Promise.all([
        getPostsService(),
        getArticlesService(),
        getNewslettersService(),
      ]);
      return resolvePublishContentKindFromId(
        contentId,
        { articles, newsletters, posts },
        signal,
      );
    },
    queryKey: ['publish-content-kind', contentId],
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <ArtifactEditorShell artifactLabel="Content" title="Loading…">
        <SkeletonCard />
      </ArtifactEditorShell>
    );
  }

  if (isError || contentKind === null || contentKind === undefined) {
    return (
      <ArtifactEditorShell artifactLabel="Content" title="Content not found">
        <div className="rounded-lg border border-dashed border-border p-6 text-muted-foreground text-sm">
          No post, article, or newsletter matches this id. Use the breadcrumb to
          return to Posts and open the item again.
        </div>
      </ArtifactEditorShell>
    );
  }

  return (
    <PublishContentEditorByKind contentId={contentId} kind={contentKind} />
  );
}

function PublishContentEditorByKind({
  contentId,
  kind,
}: {
  contentId: string;
  kind: ArtifactEditorType;
}): ReactElement {
  if (kind === 'article') {
    return <ArticleEditorContent artifactId={contentId} />;
  }

  if (kind === 'newsletter') {
    return <NewsletterEditorContent artifactId={contentId} />;
  }

  return (
    <PostDetail
      postId={contentId}
      scope={PageScope.PUBLISHER}
      presentation="page"
    />
  );
}

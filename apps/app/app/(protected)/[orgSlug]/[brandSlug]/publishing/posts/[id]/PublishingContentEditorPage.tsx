'use client';

import ArticleEditorContent from '@app/(protected)/[orgSlug]/[brandSlug]/edit/article/[id]/content';
import NewsletterEditorContent from '@app/(protected)/[orgSlug]/[brandSlug]/edit/newsletter/[id]/content';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { PageScope } from '@genfeedai/contracts';
import type { ArtifactEditorType } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import PostDetail from '@pages/posts/detail/post-detail';
import { ArticlesService } from '@services/content/articles.service';
import { NewslettersService } from '@services/content/newsletters.service';
import { PostsService } from '@services/content/posts.service';
import { useQuery } from '@tanstack/react-query';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import ArtifactEditorShell from '../../../edit/artifact-editor-shell';
import {
  type PublishingContentKind,
  resolvePublishingContentKindFromId,
} from './resolve-publishing-content-kind';

export type { PublishingContentKind };

interface PublishingContentEditorPageProps {
  contentId: string;
}

/**
 * Type-aware content desk under `/publishing/posts/:id`.
 *
 * Kind is resolved from the **entity the id belongs to** (post / article /
 * newsletter services). There is no shared row with a `type` field — three
 * tables share one desk URL — so we probe identity instead of trusting
 * `?kind=` (which breaks if the user strips the query string).
 */
export default function PublishingContentEditorPage({
  contentId,
}: PublishingContentEditorPageProps): ReactElement {
  const { isReady } = useBrand();
  const translate = useTranslations('pages.posts.desk');
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
    enabled: isReady,
    queryFn: async ({ signal }) => {
      const [posts, articles, newsletters] = await Promise.all([
        getPostsService(),
        getArticlesService(),
        getNewslettersService(),
      ]);
      return resolvePublishingContentKindFromId(
        contentId,
        { articles, newsletters, posts },
        signal,
      );
    },
    queryKey: ['publishing-content-kind', contentId],
    retry: false,
    staleTime: 60_000,
  });

  if (!isReady || isLoading) {
    return (
      <ArtifactEditorShell
        artifactLabel="Content"
        title={translate('loadingTitle')}
      >
        <SkeletonCard />
      </ArtifactEditorShell>
    );
  }

  if (isError) {
    return (
      <ArtifactEditorShell
        artifactLabel="Content"
        title={translate('loadErrorTitle')}
      >
        <div className="rounded-lg border border-dashed border-border p-6 text-muted-foreground text-sm">
          {translate('loadErrorBody')}
        </div>
      </ArtifactEditorShell>
    );
  }

  if (contentKind === null || contentKind === undefined) {
    return (
      <ArtifactEditorShell
        artifactLabel="Content"
        title={translate('missingTitle')}
      >
        <div className="rounded-lg border border-dashed border-border p-6 text-muted-foreground text-sm">
          {translate('missingBody')}
        </div>
      </ArtifactEditorShell>
    );
  }

  return (
    <PublishingContentEditorByKind contentId={contentId} kind={contentKind} />
  );
}

function PublishingContentEditorByKind({
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
      scope={PageScope.PUBLISHING}
      presentation="page"
    />
  );
}

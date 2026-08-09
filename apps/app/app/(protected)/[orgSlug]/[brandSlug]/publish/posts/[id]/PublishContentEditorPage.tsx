'use client';

import ArticleEditorContent from '@app/(protected)/[orgSlug]/[brandSlug]/edit/article/[id]/content';
import NewsletterEditorContent from '@app/(protected)/[orgSlug]/[brandSlug]/edit/newsletter/[id]/content';
import {
  APP_ROUTES,
  ARTIFACT_EDITOR_KIND_PARAM,
  ARTIFACT_EDITOR_RETURN_PARAM,
  type ArtifactEditorType,
  resolveArtifactEditorBackHref,
} from '@genfeedai/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSearchParams } from 'next/navigation';
import type { ReactElement } from 'react';
import ArtifactEditorShell from '../../../edit/artifact-editor-shell';
import PostEditorContent from './post-editor-content';

export type PublishContentKind = ArtifactEditorType;

interface PublishContentEditorPageProps {
  contentId: string;
}

export function resolvePublishContentKind(
  value: string | null,
): PublishContentKind | null {
  if (value === null || value === 'post') {
    return 'post';
  }

  if (value === 'article' || value === 'newsletter') {
    return value;
  }

  return null;
}

/**
 * Type-aware content editor under `/publish/posts/:id`.
 *
 * The editor-route helper carries long-form kind metadata in the URL. Each
 * branch renders the existing editor surface directly, keeping one canonical
 * operator URL without forking any editor implementation.
 */
export default function PublishContentEditorPage({
  contentId,
}: PublishContentEditorPageProps): ReactElement {
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const contentKind = resolvePublishContentKind(
    searchParams.get(ARTIFACT_EDITOR_KIND_PARAM),
  );

  if (contentKind === 'article') {
    return <ArticleEditorContent artifactId={contentId} />;
  }

  if (contentKind === 'newsletter') {
    return <NewsletterEditorContent artifactId={contentId} />;
  }

  if (contentKind === 'post') {
    return <PostEditorContent artifactId={contentId} />;
  }

  const backHref = resolveArtifactEditorBackHref(
    searchParams.get(ARTIFACT_EDITOR_RETURN_PARAM),
    href(APP_ROUTES.PUBLISH.POSTS),
  );

  return (
    <ArtifactEditorShell
      artifactLabel="Content"
      backHref={backHref}
      backLabel="Back to posts"
      title="Content not found"
    >
      <div className="rounded-lg border border-dashed border-border p-6 text-muted-foreground text-sm">
        This content type is unavailable. Return to Posts and open the item
        again.
      </div>
    </ArtifactEditorShell>
  );
}

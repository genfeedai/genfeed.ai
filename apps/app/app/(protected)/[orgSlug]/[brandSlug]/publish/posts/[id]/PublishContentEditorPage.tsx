'use client';

import {
  APP_ROUTES,
  ARTIFACT_EDITOR_RETURN_PARAM,
  createArtifactEditorRoute,
} from '@genfeedai/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import PostEditorContent from './post-editor-content';

/**
 * Content kinds the Publish desk can host. Social posts edit in-place;
 * long-form kinds deep-link into their dedicated editors until those share
 * this route.
 */
export type PublishContentKind = 'post' | 'article' | 'newsletter';

interface PublishContentEditorPageProps {
  contentId: string;
  /**
   * Optional kind hint from the caller (list row metadata). When omitted we
   * assume a social post — the dominant Publish entity today.
   */
  contentKind?: PublishContentKind;
}

/**
 * Type-aware content editor under `/publish/posts/:id`.
 *
 * Social posts render the post editor here. Articles and newsletters redirect
 * to their existing `/edit/{type}/:id` surfaces so we do not fork those UIs
 * before the unified content model lands.
 */
export default function PublishContentEditorPage({
  contentId,
  contentKind = 'post',
}: PublishContentEditorPageProps): ReactElement {
  const { href } = useOrgUrl();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [resolvedKind] = useState<PublishContentKind>(contentKind);

  useEffect(() => {
    if (resolvedKind === 'post') {
      return;
    }

    const returnTo =
      searchParams.get(ARTIFACT_EDITOR_RETURN_PARAM) ??
      href(APP_ROUTES.PUBLISH.POSTS);
    // Long-form still lives under /edit/* until those editors move here.
    const editorPath = createArtifactEditorRoute(
      resolvedKind === 'article' ? 'article' : 'newsletter',
      contentId,
    );
    const target = href(editorPath);
    const separator = target.includes('?') ? '&' : '?';
    router.replace(
      `${target}${separator}${ARTIFACT_EDITOR_RETURN_PARAM}=${encodeURIComponent(returnTo)}`,
    );
  }, [contentId, href, resolvedKind, router, searchParams]);

  if (resolvedKind !== 'post') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-muted-foreground">
        Opening {resolvedKind} editor…
      </div>
    );
  }

  // Social post editor — same form as the old /edit/post surface, now owned
  // by Publish. Back defaults to the Posts library.
  return <PostEditorContent artifactId={contentId} />;
}

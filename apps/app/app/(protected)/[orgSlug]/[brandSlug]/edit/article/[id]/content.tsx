'use client';

import {
  APP_ROUTES,
  ARTIFACT_EDITOR_RETURN_PARAM,
  resolveArtifactEditorBackHref,
} from '@genfeedai/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ArtifactEditorPageProps } from '@props/content/artifact-editor.props';
import { useSearchParams } from 'next/navigation';
import ArtifactEditorBackLink from '../../artifact-editor-back-link';
import ArticleDetail from '../article-detail';

/**
 * Dedicated article editor. `ArticleDetail` already owns its own action header,
 * so this page contributes only the back link to the list the article was
 * opened from.
 */
export default function ArticleEditorContent({
  artifactId,
}: ArtifactEditorPageProps) {
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();

  const backHref = resolveArtifactEditorBackHref(
    searchParams.get(ARTIFACT_EDITOR_RETURN_PARAM),
    `${href(APP_ROUTES.PUBLISHING.POSTS)}?type=article`,
  );
  const credentialId = searchParams.get('credentialId') ?? undefined;

  return (
    <div className="flex flex-col">
      <div className="border-border border-b bg-card">
        <div className="mx-auto w-full max-w-7xl px-6 py-4">
          <ArtifactEditorBackLink
            backHref={backHref}
            backLabel="Back to articles"
          />
        </div>
      </div>

      <ArticleDetail articleId={artifactId} credentialId={credentialId} />
    </div>
  );
}

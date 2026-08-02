'use client';

import { PageScope } from '@genfeedai/enums';
import PostDetail from '@pages/posts/detail/post-detail';
import type { ArtifactEditorProps } from '@props/content/artifact-editor.props';
import ArticleDetail from './article-detail';
import NewsletterEditor from './newsletter-editor';

/**
 * Single address per editable artifact: `/:orgSlug/:brandSlug/artifacts/:type/:id`.
 * Agent drafts deep-link here, so every writing surface resolves to one editor
 * per type instead of a parallel Compose module.
 */
export default function ArtifactEditor({
  artifactId,
  credentialId,
  type,
}: ArtifactEditorProps) {
  if (type === 'newsletter') {
    return <NewsletterEditor newsletterId={artifactId} />;
  }

  if (type === 'post') {
    return <PostDetail postId={artifactId} scope={PageScope.PUBLISHER} />;
  }

  return <ArticleDetail articleId={artifactId} credentialId={credentialId} />;
}

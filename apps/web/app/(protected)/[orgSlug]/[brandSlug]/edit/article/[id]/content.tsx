'use client';

import { useSearchParams } from 'next/navigation';
import type { ArtifactEditorPageProps } from '@/props/content/artifact-editor.props';
import ArticleDetail from '../article-detail';

/**
 * Dedicated article editor. `ArticleDetail` already owns its own action header,
 * so this page contributes only the back link to the list the article was
 * opened from.
 */
export default function ArticleEditorContent({
  artifactId,
}: ArtifactEditorPageProps) {
  const searchParams = useSearchParams();
  const credentialId = searchParams.get('credentialId') ?? undefined;

  return <ArticleDetail articleId={artifactId} credentialId={credentialId} />;
}

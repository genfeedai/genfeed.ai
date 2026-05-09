'use client';

import { useXArticleCompose } from '@hooks/pages/use-x-article-compose/use-x-article-compose';
import ArticleTypeSelector from '@ui/articles/type-selector/ArticleTypeSelector';
import XArticleGenerateForm from '@ui/articles/x-article/XArticleGenerateForm';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import ArticleDetail from './article-detail';

function ArticleComposeContent() {
  const { get } = useSearchParams();
  const articleId = get('id') || '';
  const credentialId = get('credentialId') || '';
  const initialPrompt = get('prompt') || '';
  const requestedType = get('type') || '';

  const [composeMode, setComposeMode] = useState<
    'select' | 'quick' | 'x-article'
  >(
    articleId
      ? 'quick'
      : requestedType === 'x-article'
        ? 'x-article'
        : 'select',
  );

  const { phase, article, handleGenerate } = useXArticleCompose();

  // If X Article was generated, show it in the detail view
  const resolvedArticleId =
    phase === 'generated' && article ? article.id : articleId;

  return composeMode === 'select' && !resolvedArticleId ? (
    <div className="container mx-auto p-6">
      <ArticleTypeSelector onSelect={(type) => setComposeMode(type)} />
    </div>
  ) : composeMode === 'x-article' && phase !== 'generated' ? (
    <div className="container mx-auto p-6">
      <XArticleGenerateForm
        credentialId={credentialId}
        initialPrompt={initialPrompt}
        onGenerate={handleGenerate}
        isGenerating={phase === 'generating'}
      />
    </div>
  ) : (
    <ArticleDetail articleId={resolvedArticleId} credentialId={credentialId} />
  );
}

export default function ArticleCompose() {
  return (
    <Suspense fallback={null}>
      <ArticleComposeContent />
    </Suspense>
  );
}

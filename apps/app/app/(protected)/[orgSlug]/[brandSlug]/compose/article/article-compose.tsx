'use client';

import { useXArticleCompose } from '@hooks/pages/use-x-article-compose/use-x-article-compose';
import ArticleTypeSelector from '@ui/articles/type-selector/ArticleTypeSelector';
import XArticleGenerateForm from '@ui/articles/x-article/XArticleGenerateForm';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import ArticleDetail from './article-detail';

export default function ArticleCompose() {
  const searchParams = useSearchParams();
  const articleId = searchParams?.get('id') || '';
  const credentialId = searchParams?.get('credentialId') || '';
  const initialPrompt = searchParams?.get('prompt') || '';
  const requestedType = searchParams?.get('type') || '';

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

  if (composeMode === 'select' && !resolvedArticleId) {
    return (
      <div className="container mx-auto p-6">
        <ArticleTypeSelector onSelect={(type) => setComposeMode(type)} />
      </div>
    );
  }

  if (composeMode === 'x-article' && phase !== 'generated') {
    return (
      <div className="container mx-auto p-6">
        <XArticleGenerateForm
          credentialId={credentialId}
          initialPrompt={initialPrompt}
          onGenerate={handleGenerate}
          isGenerating={phase === 'generating'}
        />
      </div>
    );
  }

  return (
    <ArticleDetail articleId={resolvedArticleId} credentialId={credentialId} />
  );
}

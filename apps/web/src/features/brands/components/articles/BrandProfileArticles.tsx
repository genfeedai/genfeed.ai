'use client';

import type { Article } from '@models/content/article.model';
import CollectionSection from '@ui/collection/CollectionSection';
import { EmptyState } from '@ui/primitives/empty-state';
import { useTranslations } from 'next-intl';
import BrandProfileArticleCard from './BrandProfileArticleCard';

export interface BrandProfileArticlesProps {
  articles: Article[];
  isError?: boolean;
  isPending?: boolean;
}

/**
 * The brand's published articles, the way the public profile lists them. The
 * private side adds one line the public one does not need: what an empty list
 * means for the owner.
 */
export default function BrandProfileArticles({
  articles,
  isError = false,
  isPending = false,
}: BrandProfileArticlesProps) {
  const t = useTranslations('pages.brandDetailOverview');

  return (
    <CollectionSection isLoading={isPending} title={t('articlesTitle')}>
      {isError ? (
        <EmptyState title={t('articlesLoadError')} />
      ) : articles.length === 0 && !isPending ? (
        <EmptyState
          description={t('noArticlesDescription')}
          title={t('noArticles')}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <li key={article.id}>
              <BrandProfileArticleCard article={article} />
            </li>
          ))}
        </ul>
      )}
    </CollectionSection>
  );
}

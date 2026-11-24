'use client';

import type { Article } from '@models/content/article.model';
import CollectionSection from '@ui/collection/CollectionSection';
import { EmptyState } from '@ui/primitives/empty-state';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import BrandProfileArticleCard from './BrandProfileArticleCard';

export interface BrandProfileArticlesProps {
  articles: Article[];
  isError?: boolean;
  isPending?: boolean;
  /** Overview shows the newest few and links to the tab; the tab shows them all. */
  seeAllHref?: string;
  /** How many tiles to show; all of them when omitted. */
  limit?: number;
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
  limit,
  seeAllHref,
}: BrandProfileArticlesProps) {
  const t = useTranslations('pages.brandDetailOverview');
  const shown = limit ? articles.slice(0, limit) : articles;

  return (
    <CollectionSection
      actions={
        seeAllHref && articles.length > 0 ? (
          <Link
            className="inline-flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground"
            href={seeAllHref}
          >
            {t('seeAll')}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : undefined
      }
      isLoading={isPending}
      title={t('articlesTitle')}
    >
      {isError ? (
        <EmptyState title={t('articlesLoadError')} />
      ) : shown.length === 0 && !isPending ? (
        <EmptyState
          description={t('noArticlesDescription')}
          title={t('noArticles')}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((article) => (
            <li key={article.id}>
              <BrandProfileArticleCard article={article} />
            </li>
          ))}
        </ul>
      )}
    </CollectionSection>
  );
}

import { ringNeighbors } from '@data/related-links.data';
import CreatorArticleGrid from '@web-components/creator/CreatorArticleGrid';
import { getCreatorArticleListCached } from './article-loader';

interface RelatedArticlesProps {
  /** The creator whose articles are listed; without a brand there are none. */
  brandId: string | undefined;
  handle: string;
  slug: string;
}

/**
 * The articles that follow this one in the creator's list, wrapping at the
 * end, so every article has links from three others and none is left reachable
 * only from a listing page that holds its first 24.
 */
export default async function RelatedArticles({
  brandId,
  handle,
  slug,
}: RelatedArticlesProps): Promise<React.ReactElement | null> {
  if (!brandId) {
    return null;
  }

  const articles = await getCreatorArticleListCached(brandId);
  const related = ringNeighbors(
    articles,
    articles.findIndex((article) => article.slug === slug),
  );
  if (related.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="related-articles"
      className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6"
    >
      <h2 className="mb-6 text-2xl font-semibold" id="related-articles">
        Keep reading
      </h2>
      <CreatorArticleGrid articles={related} handle={handle} />
    </section>
  );
}

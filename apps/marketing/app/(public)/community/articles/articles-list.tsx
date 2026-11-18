import type { Article } from '@models/content/article.model';
import type { PublicListPageProps } from '@props/website/public-list-page.props';
import Pagination from '@ui/navigation/pagination/Pagination';
import { EmptyState } from '@ui/primitives/empty-state';
import CreatorArticleGrid from '@web-components/creator/CreatorArticleGrid';

interface ArticlesListProps {
  articles: Article[];
  pagination?: PublicListPageProps['pagination'];
}

/**
 * Every article published on Genfeed, newest first. Each card files under its
 * author's profile at `/@handle`.
 */
export default function ArticlesList({
  articles,
  pagination,
}: ArticlesListProps) {
  return (
    <>
      {articles.length === 0 ? (
        <EmptyState surface="card" title="No articles published yet" />
      ) : (
        <section aria-label="Articles">
          <CreatorArticleGrid articles={articles} isBylineVisible />
        </section>
      )}

      {/* Keyed on the API's total, not this page's items: a page past the
          end is empty but still needs links back. */}
      {pagination && pagination.total > 0 ? (
        <div className="mt-12">
          <Pagination
            currentPage={pagination.page}
            totalItems={pagination.total}
            totalLabel="articles"
            totalPages={pagination.totalPages}
          />
        </div>
      ) : null}
    </>
  );
}

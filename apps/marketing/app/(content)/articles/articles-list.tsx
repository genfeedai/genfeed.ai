import { getAppSignUpUrl } from '@data/app-links';
import { ButtonVariant } from '@genfeedai/contracts';
import type { Article } from '@models/content/article.model';
import type { PublicListPageProps } from '@props/website/public-list-page.props';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import CreatorArticleGrid from '@web-components/creator/CreatorArticleGrid';
import Link from 'next/link';

interface ArticlesListProps {
  articles: Article[];
  pagination?: PublicListPageProps['pagination'];
}

/**
 * Every article published on Genfeed, newest first, in the `/community`
 * frame. Each card files under its author's profile at `/@handle`.
 */
export default function ArticlesList({
  articles,
  pagination,
}: ArticlesListProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-12 sm:px-6">
      <header className="mx-auto mb-16 max-w-3xl text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-foreground/50">
          Articles
        </p>
        <h1 className="mb-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Written by the Genfeed community
        </h1>
        <p className="mb-8 text-lg text-foreground/70">
          Guides, case studies and stories from creators who publish on Genfeed.
          Every article lives on its author's profile at genfeed.ai/@handle.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild withWrapper={false}>
            <a href={getAppSignUpUrl()}>Publish yours</a>
          </Button>
          <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
            <Link href="/community">Explore the community</Link>
          </Button>
        </div>
      </header>

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
    </div>
  );
}

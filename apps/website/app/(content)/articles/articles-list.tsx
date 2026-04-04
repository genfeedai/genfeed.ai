import type { Article } from '@models/content/article.model';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import Link from 'next/link';
import { HiCalendar, HiClock } from 'react-icons/hi2';

interface ArticlesListProps {
  articles: Article[];
}

export default function ArticlesList({ articles }: ArticlesListProps) {
  if (articles.length === 0) {
    return <CardEmpty label="No articles published yet" />;
  }

  return (
    <Container
      label="Articles"
      description="Read our latest articles"
      className="min-h-screen pt-24"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
        {articles.map((article) => {
          const excerpt = article.content
            ? `${article.content.replace(/<[^>]*>/g, ' ').substring(0, 200)}...`
            : null;

          return (
            <Link
              key={article.id}
              href={`/articles/${article.slug || article.id}`}
              className="group block"
            >
              <Card className="h-full border border-edge/[0.08] transition-all hover:shadow-lg">
                <h2 className="mb-2 text-2xl font-bold transition-colors group-hover:text-primary">
                  {article.label}
                </h2>

                {article.category && (
                  <div className="mb-3">
                    <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {article.category}
                    </span>
                  </div>
                )}

                {article.summary && (
                  <p className="mb-4 line-clamp-2 text-base text-foreground/80">
                    {article.summary}
                  </p>
                )}

                {excerpt && (
                  <p className="prose prose-sm mb-4 line-clamp-3 max-w-none text-foreground/70">
                    {excerpt}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 border-t border-edge/[0.08] pt-4 text-sm text-foreground/60">
                  {article.publishedAt && (
                    <div className="flex items-center gap-2">
                      <HiCalendar className="h-4 w-4" />
                      <span>
                        {new Date(article.publishedAt).toLocaleDateString(
                          'en-US',
                          {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          },
                        )}
                      </span>
                    </div>
                  )}
                  {article.readingTime && (
                    <div className="flex items-center gap-2">
                      <HiClock className="h-4 w-4" />
                      <span>{article.readingTime} min read</span>
                    </div>
                  )}

                  {article.author && (
                    <div className="flex items-center gap-2">
                      <span>by {article.author}</span>
                    </div>
                  )}
                </div>
              </Card>
            </Link>
          );
        })}

        <div className="mt-4">
          <AutoPagination />
        </div>
      </div>
    </Container>
  );
}

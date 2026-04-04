import type { IArticle } from '@genfeedai/interfaces';
import type { ProfileArticlesProps } from '@props/content/profile.props';
import Image from 'next/image';
import Link from 'next/link';

export default function ProfileArticles({ articles }: ProfileArticlesProps) {
  if (articles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {articles.map((article: IArticle) => (
        <Link
          key={article.id}
          href={`/articles/${article.slug}`}
          className="block bg-fill/10 hover:bg-fill/20 backdrop-blur-sm overflow-hidden transition-all border border-edge/[0.08] hover:border-edge/20"
        >
          {article.bannerUrl && (
            <div className="relative h-48 w-full">
              <Image
                className="object-cover"
                src={article.bannerUrl}
                alt={article.label}
                fill
              />
            </div>
          )}

          <div className="p-4">
            <h3 className="text-surface font-semibold mb-2 line-clamp-2">
              {article.label}
            </h3>

            {article.summary && (
              <p className="text-surface/70 text-sm line-clamp-2">
                {article.summary}
              </p>
            )}

            {article.readingTime && (
              <div className="text-surface/50 text-xs mt-2">
                {article.readingTime} min read
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

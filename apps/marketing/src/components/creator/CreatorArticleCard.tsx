import { CardVariant } from '@genfeedai/contracts';
import {
  articleHandle,
  creatorArticlePath,
} from '@genfeedai/contracts/constants';
import type { CreatorArticleCardProps } from '@props/content/creator.props';
import Card from '@ui/card/Card';
import ArticleCover from '@website/(content)/articles/article-cover';
import Link from 'next/link';

const articleDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

/** An article tile: cover, title, summary, and when it went out. */
export default function CreatorArticleCard({
  article,
  handle: profileHandle,
  isBylineVisible = false,
}: CreatorArticleCardProps): React.ReactElement {
  const handle = profileHandle ?? articleHandle(article.brand?.slug);
  const slug = article.slug || article.id;

  return (
    <Link
      className="group block h-full"
      href={creatorArticlePath(handle, slug)}
    >
      <Card isInteractive variant={CardVariant.BORDERED} className="h-full">
        <ArticleCover
          category={article.category}
          className="mb-4 aspect-[16/9]"
          coverImageUrl={article.coverImageUrl}
          isCompact
          label={article.label}
          seed={slug}
        />
        <h3 className="mb-2 line-clamp-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
          {article.label}
        </h3>
        {article.summary ? (
          <p className="mb-3 line-clamp-2 text-sm text-foreground/70">
            {article.summary}
          </p>
        ) : null}
        <p className="text-xs text-foreground/50">
          {isBylineVisible ? <span>@{handle} · </span> : null}
          {article.publishedAt ? (
            <time dateTime={article.publishedAt}>
              {articleDateFormatter.format(new Date(article.publishedAt))}
            </time>
          ) : null}
          {article.readingTime ? (
            <span> · {article.readingTime} min read</span>
          ) : null}
        </p>
      </Card>
    </Link>
  );
}

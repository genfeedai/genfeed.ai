'use client';

import { CardVariant } from '@genfeedai/contracts';
import { createArtifactEditorRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Article } from '@models/content/article.model';
import Card from '@ui/card/Card';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const articleDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

/** One published article, as a tile that opens its editor. */
export default function BrandProfileArticleCard({
  article,
}: {
  article: Article;
}) {
  const t = useTranslations('pages.brandDetailOverview');
  const { href } = useOrgUrl();

  return (
    <Link
      aria-label={t('openArticle', { label: article.label })}
      className="group block h-full"
      href={href(createArtifactEditorRoute('article', article.id))}
    >
      <Card isInteractive variant={CardVariant.BORDERED} className="h-full">
        {article.coverImageUrl ? (
          <div className="relative mb-4 aspect-[16/9] w-full overflow-hidden rounded-lg bg-muted">
            <Image
              alt=""
              className="object-cover"
              fill
              src={article.coverImageUrl}
              unoptimized
            />
          </div>
        ) : null}
        <h3 className="mb-2 line-clamp-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
          {article.label}
        </h3>
        {article.summary ? (
          <p className="mb-3 line-clamp-2 text-sm text-foreground/70">
            {article.summary}
          </p>
        ) : null}
        <p className="text-xs text-foreground/50">
          {article.publishedAt ? (
            <time dateTime={article.publishedAt}>
              {articleDateFormatter.format(new Date(article.publishedAt))}
            </time>
          ) : null}
          {article.readingTime ? (
            <span> · {t('readingTime', { minutes: article.readingTime })}</span>
          ) : null}
        </p>
      </Card>
    </Link>
  );
}

'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailLatestArticlesProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import NextLink from 'next/link';

export default function BrandDetailLatestArticles({
  articles,
}: BrandDetailLatestArticlesProps) {
  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Latest Articles</h2>
        <Button
          asChild
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-xs font-medium transition-all duration-300 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-8 px-3"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <NextLink href={`${EnvironmentService.apps.app}/compose/article`}>
            View All
          </NextLink>
        </Button>
      </div>

      {articles && articles.length > 0 ? (
        <div className="flex flex-col gap-4">
          {articles.map((article) => (
            <div
              key={article.id}
              className="overflow-hidden hover:shadow-lg transition-shadow"
            >
              {article.bannerUrl && (
                <div className="relative w-full h-48">
                  <Image
                    src={article.bannerUrl}
                    alt={article.label || 'Article'}
                    width={800}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="bg-muted/50 p-4">
                <h3 className="text-lg font-semibold mb-2">{article.label}</h3>

                {article.summary && (
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {article.summary}
                  </p>
                )}

                <Button
                  asChild
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-xs font-medium transition-all duration-300 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 px-3"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <NextLink
                    href={`${EnvironmentService.apps.website}/articles/${article.slug}`}
                    target="_blank"
                  >
                    Read Article
                  </NextLink>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Button
          asChild
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-300 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <NextLink href={`${EnvironmentService.apps.app}`}>
            Create an Article
          </NextLink>
        </Button>
      )}
    </Card>
  );
}

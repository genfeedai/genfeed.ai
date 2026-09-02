'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { BrandDetailLatestArticlesProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import NextLink from 'next/link';

// Writing starts in the Agent; the artifact editor takes over once a draft exists.
const WRITE_ARTICLE_AGENT_HREF = buildAgentPromptHref(
  'Help me write a new long-form article for my brand.',
);

export default function BrandDetailLatestArticles({
  articles,
}: BrandDetailLatestArticlesProps) {
  const { href } = useOrgUrl();

  return (
    <Card
      label="Latest Articles"
      bodyClassName="gap-3 p-4"
      headerAction={
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <NextLink href={`${href(APP_ROUTES.PUBLISHING.POSTS)}?type=article`}>
            View all
          </NextLink>
        </Button>
      }
    >
      {articles && articles.length > 0 ? (
        <div className="flex flex-col gap-3">
          {articles.map((article) => (
            <div
              key={article.id}
              className="overflow-hidden rounded-lg border border-border/50"
            >
              {article.coverImageUrl ? (
                <div className="relative h-36 w-full">
                  <Image
                    src={article.coverImageUrl}
                    alt={article.label || 'Article'}
                    width={800}
                    height={400}
                    className="size-full object-cover"
                  />
                </div>
              ) : null}

              <div className="p-3">
                <h3 className="text-sm font-semibold">{article.label}</h3>
                {article.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {article.summary}
                  </p>
                ) : null}
                <Button
                  asChild
                  className="mt-2"
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                >
                  <NextLink
                    href={`${EnvironmentService.apps.website}/articles/${article.slug}`}
                    target="_blank"
                  >
                    Read article
                  </NextLink>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground/70">
            No articles yet
          </p>
          <p className="max-w-xs text-xs leading-5 text-foreground/45">
            Draft an article for this brand to populate this strip.
          </p>
          <Button
            asChild
            className="mt-2"
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            <NextLink
              href={`${EnvironmentService.apps.app}${href(WRITE_ARTICLE_AGENT_HREF)}`}
            >
              Create an article
            </NextLink>
          </Button>
        </div>
      )}
    </Card>
  );
}

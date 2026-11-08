import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES, creatorArticlePath } from '@genfeedai/contracts/constants';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { BrandDetailLatestArticlesProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import NextLink from 'next/link';
import BrandDetailLatestContentCard from './BrandDetailLatestContentCard';

// Writing starts in the Agent; the artifact editor takes over once a draft exists.
const WRITE_ARTICLE_AGENT_HREF = buildAgentPromptHref(
  'Help me write a new long-form article for my brand.',
);

export default function BrandDetailLatestArticles({
  articles,
  publicHandle,
}: BrandDetailLatestArticlesProps) {
  const { href } = useOrgUrl();

  return (
    <BrandDetailLatestContentCard
      label="Latest Articles"
      viewAllLink={
        <NextLink href={`${href(APP_ROUTES.PUBLISHING.POSTS)}?type=article`}>
          View all
        </NextLink>
      }
      emptyTitle="No articles yet"
      createLabel="Create an article"
      createHref={`${EnvironmentService.apps.app}${href(WRITE_ARTICLE_AGENT_HREF)}`}
    >
      {articles && articles.length > 0 ? (
        <CollectionGrid maxColumns={3}>
          {articles.map((article) => (
            <div
              key={article.id}
              className="flex flex-col overflow-hidden rounded-lg border border-border/50"
            >
              {article.coverImageUrl ? (
                <div className="relative aspect-video w-full">
                  <Image
                    src={article.coverImageUrl}
                    alt={article.label || 'Article'}
                    width={800}
                    height={400}
                    className="size-full object-cover outline-media"
                  />
                </div>
              ) : null}

              <div className="flex flex-1 flex-col p-3">
                <h3 className="line-clamp-2 text-sm font-semibold">
                  {article.label}
                </h3>
                {article.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {article.summary}
                  </p>
                ) : null}
                {publicHandle && article.slug ? (
                  <Button
                    asChild
                    className="mt-auto self-start"
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                    withWrapper={false}
                  >
                    <NextLink
                      href={`${EnvironmentService.apps.website}${creatorArticlePath(
                        publicHandle,
                        article.slug,
                      )}`}
                      target="_blank"
                    >
                      Read article
                    </NextLink>
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CollectionGrid>
      ) : null}
    </BrandDetailLatestContentCard>
  );
}

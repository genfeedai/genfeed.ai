import { getAppSignUpUrl, SIGN_UP_LABEL } from '@data/app-links';
import { stringifyJsonLd } from '@data/json-ld';
import { getMarketingOgImage } from '@data/marketing-og.data';
import {
  creatorProfilePath,
  GENFEED_BRAND_HANDLE,
} from '@genfeedai/contracts/constants';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import { Button } from '@ui/primitives/button';
import CreatorArticleGrid from '@web-components/creator/CreatorArticleGrid';
import HomeFooter from '@web-components/home/_footer';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getGenfeedArticlesCached } from './blog-loader';

export const revalidate = 300;

const BLOG_TITLE = 'Genfeed Blog: AI Content Workflows and Tools';
const BLOG_PATH = '/blog';
const BLOG_DESCRIPTION =
  'Guides on AI content workflows, agents, MCP and self-hosting, from the team building Genfeed. Every article is public and open to read.';

const blogJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  description: BLOG_DESCRIPTION,
  isPartOf: {
    '@type': 'WebSite',
    name: metadata.name,
    url: metadata.url,
  },
  name: BLOG_TITLE,
  url: `${metadata.url}${BLOG_PATH}`,
};

export function generateMetadata(): Metadata {
  const url = `${metadata.url}${BLOG_PATH}`;
  const title = `${BLOG_TITLE} | ${metadata.name}`;
  const images = [getMarketingOgImage(BLOG_PATH, 'Genfeed blog')];

  return {
    alternates: { canonical: url },
    description: BLOG_DESCRIPTION,
    openGraph: {
      description: BLOG_DESCRIPTION,
      images,
      siteName: metadata.name,
      title,
      type: 'website',
      url,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      description: BLOG_DESCRIPTION,
      images,
      title,
    },
  };
}

export default async function BlogPage(): Promise<React.ReactElement> {
  const articles = await getGenfeedArticlesCached();

  return (
    <>
      <script type="application/ld+json">{stringifyJsonLd(blogJsonLd)}</script>
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-12 sm:px-6">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="mb-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Genfeed blog
            </h1>
            <p className="text-base text-foreground/70">{BLOG_DESCRIPTION}</p>
            <p className="mt-3 text-sm text-foreground/60">
              Every article is also on the{' '}
              <Link
                className="underline underline-offset-4"
                href={creatorProfilePath(GENFEED_BRAND_HANDLE)}
              >
                Genfeed profile
              </Link>
              , where you can follow what we publish.
            </p>
          </div>
          <Button asChild withWrapper={false}>
            <a href={getAppSignUpUrl()}>{SIGN_UP_LABEL}</a>
          </Button>
        </header>

        {articles.length > 0 ? (
          <section aria-label="Articles">
            <CreatorArticleGrid
              articles={articles}
              handle={GENFEED_BRAND_HANDLE}
            />
          </section>
        ) : (
          <p className="text-foreground/70">
            Nothing is published here yet. Read what the community publishes in{' '}
            <Link
              className="underline underline-offset-4"
              href="/community/articles"
            >
              community articles
            </Link>
            .
          </p>
        )}
      </div>
      <HomeFooter />
    </>
  );
}

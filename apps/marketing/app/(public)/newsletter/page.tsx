import { getMarketingOgImage } from '@data/marketing-og.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { NewsletterArchiveRouteProps } from '@props/content/newsletter.props';
import NewsletterArchiveContent from '@web-components/newsletter/NewsletterArchiveContent';
import type { Metadata } from 'next';
import {
  getGenfeedNewsletterArchive,
  resolveNewsletterPage,
} from './newsletter-loader';

export const revalidate = 300;

const NEWSLETTER_PATH = '/newsletter';
const NEWSLETTER_TITLE = 'The Genfeed Newsletter';
const NEWSLETTER_DESCRIPTION =
  'Every issue of the Genfeed newsletter: what we shipped, what worked on our own feeds, and the workflows behind it.';

export async function generateMetadata({
  searchParams,
}: NewsletterArchiveRouteProps): Promise<Metadata> {
  const page = resolveNewsletterPage((await searchParams).page);
  const pageLabel = page > 1 ? ` – Page ${page}` : '';
  const title = `${NEWSLETTER_TITLE}${pageLabel} | ${metadata.name}`;
  const url =
    page > 1
      ? `${metadata.url}${NEWSLETTER_PATH}?page=${page}`
      : `${metadata.url}${NEWSLETTER_PATH}`;
  const images = [getMarketingOgImage(NEWSLETTER_PATH, NEWSLETTER_TITLE)];

  return {
    alternates: { canonical: url },
    description: NEWSLETTER_DESCRIPTION,
    openGraph: {
      description: NEWSLETTER_DESCRIPTION,
      images,
      siteName: metadata.name,
      title,
      type: 'website',
      url,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      description: NEWSLETTER_DESCRIPTION,
      images,
      title,
    },
  };
}

export default async function NewsletterArchivePage({
  searchParams,
}: NewsletterArchiveRouteProps) {
  const page = resolveNewsletterPage((await searchParams).page);
  const { archive, brand } = await getGenfeedNewsletterArchive(page);

  return (
    <NewsletterArchiveContent
      archive={archive}
      bannerUrl={brand?.bannerUrl}
      logoUrl={brand?.logoUrl}
      page={page}
    />
  );
}

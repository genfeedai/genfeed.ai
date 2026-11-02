import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ContentPreviewContent from './content';

/**
 * The link is the credential: keep it out of search results and never send it
 * on as a referrer to other sites.
 */
export async function generateMetadata(): Promise<Metadata> {
  const translate = await getTranslations('common.contentPreview');
  return {
    referrer: 'no-referrer',
    robots: { follow: false, index: false },
    title: translate('metaTitle'),
  };
}

export default async function ContentPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ContentPreviewContent token={token} />;
}

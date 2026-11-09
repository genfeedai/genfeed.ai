import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { NewsletterIssueRouteProps } from '@props/content/newsletter.props';
import NewsletterIssueContent from '@web-components/newsletter/NewsletterIssueContent';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGenfeedNewsletterIssue } from '../newsletter-loader';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: NewsletterIssueRouteProps): Promise<Metadata> {
  const { id } = await params;
  const issue = await getGenfeedNewsletterIssue(id);
  if (!issue) {
    return { robots: { follow: false, index: false } };
  }

  const url = `${metadata.url}/newsletter/${issue.id}`;
  const title = `${issue.subject} | ${metadata.name} Newsletter`;
  const description = issue.summary ?? metadata.description;

  return {
    alternates: { canonical: url },
    description,
    openGraph: {
      description,
      publishedTime: issue.publishedAt,
      siteName: metadata.name,
      title,
      type: 'article',
      url,
    },
    title,
    twitter: { card: 'summary', description, title },
  };
}

export default async function NewsletterIssuePage({
  params,
}: NewsletterIssueRouteProps) {
  const { id } = await params;
  const issue = await getGenfeedNewsletterIssue(id);
  if (!issue) notFound();

  return <NewsletterIssueContent issue={issue} />;
}

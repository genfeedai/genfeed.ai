import { createMarkup } from '@genfeedai/helpers';
import type { NewsletterIssueContentProps } from '@props/content/newsletter.props';
import Link from 'next/link';
import NewsletterIssueMeta from './NewsletterIssueMeta';
import NewsletterSubscribeForm from './NewsletterSubscribeForm';

/**
 * One issue as a server-rendered page. Gated issues show the opening only;
 * the rest goes to subscribers by email.
 */
export default function NewsletterIssueContent({
  issue,
}: NewsletterIssueContentProps) {
  // The API already sanitizes; sanitizing again here keeps the page safe even
  // if that ever changes, and the sanitizer never ships to readers.
  const contentProps = { dangerouslySetInnerHTML: createMarkup(issue.html) };

  return (
    <article className="mx-auto max-w-3xl px-6 py-20">
      <nav
        aria-label="Breadcrumb"
        className="mb-8 text-sm text-muted-foreground"
      >
        <Link className="hover:text-foreground" href="/newsletter">
          Newsletter
        </Link>
      </nav>
      <header className="space-y-3 pb-8">
        <h1 className="text-4xl font-semibold tracking-tight">
          {issue.subject}
        </h1>
        {issue.summary ? (
          <p className="text-lg leading-8 text-muted-foreground">
            {issue.summary}
          </p>
        ) : null}
        <NewsletterIssueMeta issue={issue} />
      </header>
      <div
        className="gen-article-prose prose prose-invert prose-lg max-w-none border-t border-border pt-8"
        {...contentProps}
      />
      <footer className="mt-12 border-t border-border pt-8">
        <NewsletterSubscribeForm
          brandId={issue.brand.id}
          className="max-w-md"
          description={
            issue.isPreview
              ? 'This is the opening. Subscribe to get the full issue by email.'
              : `Get the next ${issue.brand.label} issue by email.`
          }
          source="archive"
          sourceRef={issue.id}
          title="Subscribe"
        />
      </footer>
    </article>
  );
}

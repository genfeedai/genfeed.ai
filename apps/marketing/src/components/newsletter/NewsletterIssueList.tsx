import type { NewsletterIssueListProps } from '@props/content/newsletter.props';
import Link from 'next/link';
import NewsletterIssueMeta from './NewsletterIssueMeta';

/** Past issues, newest first: title, summary, date and reading time. */
export default function NewsletterIssueList({
  issues,
}: NewsletterIssueListProps) {
  return (
    <ol className="border-t border-border">
      {issues.map((issue) => (
        <li className="border-b border-border" key={issue.id}>
          <article className="space-y-2 py-6">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              <Link
                className="hover:underline underline-offset-4"
                href={`/newsletter/${issue.id}`}
              >
                {issue.subject}
              </Link>
            </h2>
            {issue.summary ? (
              <p className="leading-7 text-muted-foreground">{issue.summary}</p>
            ) : null}
            <NewsletterIssueMeta issue={issue} />
          </article>
        </li>
      ))}
    </ol>
  );
}

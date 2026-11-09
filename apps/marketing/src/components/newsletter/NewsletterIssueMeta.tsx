import type { NewsletterIssueMetaProps } from '@props/content/newsletter.props';

const ISSUE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

const ACCESS_LABELS = {
  paid: 'Paid subscribers',
  public: null,
  subscribers: 'Subscribers',
} as const;

/** Date, reading time and, for gated issues, who the full issue is for. */
export default function NewsletterIssueMeta({
  issue,
}: NewsletterIssueMetaProps) {
  const accessLabel = ACCESS_LABELS[issue.accessLevel];

  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <time dateTime={issue.publishedAt}>
        {ISSUE_DATE_FORMAT.format(new Date(issue.publishedAt))}
      </time>
      <span aria-hidden="true">·</span>
      <span>{issue.readingMinutes} min read</span>
      {accessLabel ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{accessLabel}</span>
        </>
      ) : null}
    </p>
  );
}

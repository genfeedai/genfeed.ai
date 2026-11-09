import type { NewsletterArchiveContentProps } from '@props/content/newsletter.props';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { BrandBanner } from '@ui/primitives/brand-banner';
import Link from 'next/link';
import NewsletterIssueList from './NewsletterIssueList';
import NewsletterSubscribeForm from './NewsletterSubscribeForm';

const NEWSLETTER_DESCRIPTION =
  'What we shipped, what worked on our own feeds, and the workflows behind it. Written and sent with Genfeed.';

/** Genfeed's newsletter: who sends it, the sign-up box and every past issue. */
export default function NewsletterArchiveContent({
  archive,
  bannerUrl,
  logoUrl,
  page,
}: NewsletterArchiveContentProps) {
  const brandLabel = archive?.brand.label || 'Genfeed';
  const issues = archive?.issues ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      {bannerUrl ? (
        <BrandBanner
          alt={`${brandLabel} banner`}
          className="mb-8"
          isPriority
          shape="rounded"
          sizes="(min-width: 768px) 720px, 100vw"
          src={bannerUrl}
        />
      ) : null}
      <header className="space-y-4 pb-10">
        <div className="flex items-center gap-3">
          <BrandAvatar
            alt={`${brandLabel} logo`}
            name={brandLabel}
            size="lg"
            src={logoUrl}
          />
          <h1 className="text-4xl font-semibold tracking-tight">Newsletter</h1>
        </div>
        <p className="leading-7 text-muted-foreground">
          {NEWSLETTER_DESCRIPTION}
        </p>
        {archive ? (
          <NewsletterSubscribeForm
            brandId={archive.brand.id}
            className="max-w-md"
            source="archive"
          />
        ) : null}
      </header>

      {!archive ? (
        <p className="border-t border-border py-8 text-muted-foreground">
          The archive is temporarily unavailable. Check back in a few minutes.
        </p>
      ) : issues.length === 0 ? (
        <p className="border-t border-border py-8 text-muted-foreground">
          {page > 1
            ? 'No issues on this page.'
            : 'The first issue is on its way. Subscribe to get it.'}
        </p>
      ) : (
        <NewsletterIssueList issues={issues} />
      )}

      {page > 1 || archive?.hasMore ? (
        <nav
          aria-label="Newsletter pages"
          className="flex justify-between pt-8 text-sm"
        >
          {page > 1 ? (
            <Link
              className="underline underline-offset-4"
              href={page === 2 ? '/newsletter' : `/newsletter?page=${page - 1}`}
            >
              Newer issues
            </Link>
          ) : (
            <span />
          )}
          {archive?.hasMore ? (
            <Link
              className="underline underline-offset-4"
              href={`/newsletter?page=${page + 1}`}
            >
              Older issues
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

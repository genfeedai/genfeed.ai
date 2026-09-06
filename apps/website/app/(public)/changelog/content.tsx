'use client';

import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import type { ChangelogProps } from '@genfeedai/props/pages/changelog.props';
import Link from 'next/link';

export default function ChangelogContent({ releases }: ChangelogProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-12 px-6 py-20">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-muted-foreground">What's new in Genfeed.</p>
      </header>
      {releases.map((release) => (
        <article key={release.tag} className="space-y-5 border-t pt-8">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold">
              <Link
                href={release.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {release.tag}
              </Link>
            </h2>
            <time
              dateTime={release.publishedAt}
              className="text-sm text-muted-foreground"
            >
              {new Date(release.publishedAt).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
                year: 'numeric',
              })}
            </time>
          </header>
          {release.body.trim() && <SafeMarkdown content={release.body} />}
        </article>
      ))}
    </main>
  );
}

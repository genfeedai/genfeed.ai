'use client';

import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import type { ChangelogProps } from '@genfeedai/props/pages/changelog.props';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

import {
  formatReleaseDate,
  releaseNotes,
  releaseSummary,
} from './release-notes';

type Release = ChangelogProps['releases'][number];

function GitHubReleaseLink({ release }: { release: Release }) {
  return (
    <Link
      href={release.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${release.tag} on GitHub`}
      className="inline-flex w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
    >
      <ExternalLink aria-hidden className="size-4" />
    </Link>
  );
}

function ReleaseTitle({
  release,
  summary,
}: {
  release: Release;
  summary: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1 pr-3 text-left">
      <span className="text-xl font-semibold tracking-tight text-foreground">
        {release.tag}
      </span>
      {summary ? (
        <span className="min-w-0 truncate text-sm font-normal text-muted-foreground">
          {summary}
        </span>
      ) : null}
      <time
        dateTime={release.publishedAt}
        className="ml-auto shrink-0 text-sm font-normal text-muted-foreground"
      >
        {formatReleaseDate(release.publishedAt)}
      </time>
    </span>
  );
}

function ReleaseEntry({ release }: { release: Release }) {
  const notes = releaseNotes(release.body, release.tag);
  const summary = releaseSummary(notes);

  if (!notes) {
    return (
      <article className="border-b border-border">
        <h2 className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-5">
          <Link
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xl font-semibold tracking-tight hover:underline"
          >
            {release.tag}
          </Link>
          <time
            dateTime={release.publishedAt}
            className="ml-auto shrink-0 text-sm text-muted-foreground"
          >
            {formatReleaseDate(release.publishedAt)}
          </time>
        </h2>
      </article>
    );
  }

  return (
    <article className="border-b border-border">
      <Collapsible>
        <div className="flex items-stretch hover:bg-hover">
          <h2 className="min-w-0 flex-1">
            <CollapsibleTrigger className="h-full py-5 font-normal text-muted-foreground hover:no-underline">
              <ReleaseTitle release={release} summary={summary} />
            </CollapsibleTrigger>
          </h2>
          <GitHubReleaseLink release={release} />
        </div>
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <SafeMarkdown content={notes} />
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}

export default function ChangelogContent({ releases }: ChangelogProps) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <header className="space-y-3 pb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-muted-foreground">What's new in Genfeed.</p>
      </header>
      <div className="border-t border-border">
        {releases.map((release) => (
          <ReleaseEntry key={release.tag} release={release} />
        ))}
      </div>
    </main>
  );
}

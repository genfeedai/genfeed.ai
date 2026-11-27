import type { ChangelogProps } from '@props/pages/changelog.props';
import Link from 'next/link';

import {
  formatReleaseDate,
  releaseNotes,
  releasePath,
  releaseSummary,
} from './release-notes';

type Release = ChangelogProps['releases'][number];

export const GITHUB_RELEASES_URL =
  'https://github.com/genfeedai/genfeed.ai/releases';

function ReleaseRow({ release }: { release: Release }) {
  const summary = releaseSummary(releaseNotes(release.body, release.tag));

  return (
    <li className="border-b border-border">
      <h2>
        <Link
          href={releasePath(release.tag)}
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-5 hover:bg-hover"
        >
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
        </Link>
      </h2>
    </li>
  );
}

/**
 * Server-rendered list of every release, one row each. The notes live on the
 * release's own page (`/changelog/<tag>`): with every body inline the page was
 * 7.6 MB of HTML, past the 2 MB a search crawler reads.
 */
export default function ChangelogContent({
  isUnavailable = false,
  releases,
}: ChangelogProps) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <header className="space-y-3 pb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-muted-foreground">What's new in Genfeed.</p>
      </header>
      {isUnavailable ? (
        <p className="border-t border-border py-8 text-muted-foreground">
          Release notes are temporarily unavailable. Read them on{' '}
          <Link
            href={GITHUB_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-4"
          >
            GitHub
          </Link>{' '}
          or check back in a few minutes.
        </p>
      ) : (
        <ul className="border-t border-border">
          {releases.map((release) => (
            <ReleaseRow key={release.tag} release={release} />
          ))}
        </ul>
      )}
    </div>
  );
}

import { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import type { PublishedRelease } from '@genfeedai/contracts/interfaces/system/app-build.interface';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { formatReleaseDate, releaseNotes } from '../release-notes';

const codeBlockLabels = {
  copied: 'Copied',
  copy: 'Copy code',
  copyAria: 'Copy code block',
};

/** Server-rendered notes of one release. */
export default function ReleaseContent({
  release,
}: {
  release: PublishedRelease;
}) {
  const notes = releaseNotes(release.body, release.tag);

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <Link
        href="/changelog"
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        All releases
      </Link>
      <header className="space-y-3 pb-10 pt-6">
        <h1 className="text-4xl font-semibold tracking-tight">
          Genfeed {release.tag}
        </h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <time dateTime={release.publishedAt}>
            {formatReleaseDate(release.publishedAt)}
          </time>
          <Link
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
          >
            {release.tag} on GitHub
            <ExternalLink aria-hidden className="size-3.5" />
          </Link>
        </p>
      </header>
      <div className="border-t border-border">
        {notes ? (
          <SafeMarkdown content={notes} codeBlockLabels={codeBlockLabels} />
        ) : (
          <p className="py-8 text-muted-foreground">
            This release has no written notes. See it on GitHub.
          </p>
        )}
      </div>
    </div>
  );
}

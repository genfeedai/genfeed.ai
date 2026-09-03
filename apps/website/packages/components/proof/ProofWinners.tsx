import type { Winner } from '@data/winners.data';
import { getPublishedWinners } from '@data/winners.data';
import { LinkedinIcon } from '@genfeedai/helpers/ui/icons/brands';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import SectionHeader from '@ui/marketing/SectionHeader';
import { WebSection } from '@web-components/content/NeuralGrid';
import { ExternalLink, MessageCircle, Repeat2, ThumbsUp } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

function PublishedLinkedInPost({ winner }: { winner: Winner }) {
  const proof = winner.socialProof;

  if (!proof) {
    return null;
  }

  return (
    <article
      aria-label={`Published LinkedIn post by ${proof.authorName}`}
      className="overflow-hidden rounded-2xl border border-edge/10 bg-background shadow-border-strong"
    >
      <div className="flex items-start justify-between gap-5 px-5 pb-4 pt-5 sm:px-7 sm:pt-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-bold text-background">
            VT
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-surface">
              {proof.authorName}
            </p>
            <p className="truncate text-xs text-surface/55">
              {proof.authorHeadline}
            </p>
            <p className="mt-0.5 truncate text-xs text-surface/45">
              @{proof.authorHandle} &middot;{' '}
              <time dateTime={winner.publishedAt}>
                {formatDate(winner.publishedAt, DATE_FORMATS.DISPLAY_DATE)}
              </time>
            </p>
          </div>
        </div>
        <LinkedinIcon className="size-6 shrink-0 text-platform-linkedin" />
      </div>

      <p className="px-5 pb-5 text-[15px] leading-7 text-surface/88 sm:px-7 sm:text-base">
        {proof.captionExcerpt}
      </p>

      {winner.previewSrc && (
        <div className="relative aspect-[5/2] overflow-hidden border-y border-edge/10 bg-card">
          <Image
            alt={winner.previewAlt ?? winner.title}
            className="object-cover"
            fill
            sizes="(max-width: 768px) 100vw, 760px"
            src={winner.previewSrc}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-surface/55 sm:px-7">
        <span className="inline-flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-platform-linkedin text-white">
            <ThumbsUp className="size-3" />
          </span>
          {proof.reactions}
        </span>
        <span>
          {proof.comments} &middot; {proof.reposts}
        </span>
      </div>

      <div className="grid grid-cols-3 border-t border-edge/10 px-3 py-3 text-xs font-medium text-surface/55 sm:px-5">
        <span className="inline-flex items-center justify-center gap-2">
          <ThumbsUp className="size-4" />
          Like
        </span>
        <span className="inline-flex items-center justify-center gap-2">
          <MessageCircle className="size-4" />
          Comment
        </span>
        <span className="inline-flex items-center justify-center gap-2">
          <Repeat2 className="size-4" />
          Repost
        </span>
      </div>
    </article>
  );
}

function PublishedOutputPreview({ winner }: { winner: Winner }) {
  if (winner.platform === 'LinkedIn' && winner.socialProof) {
    return <PublishedLinkedInPost winner={winner} />;
  }

  return (
    <article
      aria-label={`Published ${winner.platform} output`}
      className="overflow-hidden rounded-2xl border border-edge/10 bg-background shadow-border-strong"
    >
      {winner.previewSrc && (
        <div className="relative aspect-[16/10] overflow-hidden border-b border-edge/10 bg-card">
          <Image
            alt={winner.previewAlt ?? winner.title}
            className="object-cover"
            fill
            sizes="(max-width: 768px) 100vw, 760px"
            src={winner.previewSrc}
          />
        </div>
      )}
      <div className="p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-surface/55">
          {winner.platform} &middot; {winner.mediaType}
        </p>
        <p className="mt-4 text-xl font-medium leading-8 text-surface">
          {winner.title}
        </p>
      </div>
    </article>
  );
}

/**
 * Renders nothing until a piece is published with verified provenance and a
 * metric behind it. Each winner is a source-backed case study rather than a
 * placeholder marketing card.
 */
export default function ProofWinners(): React.ReactElement | null {
  const publishedWinners = getPublishedWinners();

  if (publishedWinners.length === 0) {
    return null;
  }

  return (
    <WebSection bg="bordered" maxWidth="xl" py="lg">
      <div data-reveal="up">
        <SectionHeader
          className="mb-10 [&_h2]:text-5xl"
          description="Created in Genfeed. Published on LinkedIn. Verified after launch."
          title="Your next post."
        />
      </div>

      <div className="space-y-6">
        {publishedWinners.map((winner) => (
          <div
            key={winner.id}
            className="grid overflow-hidden rounded-2xl border border-edge/10 bg-card lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]"
            data-reveal="up"
          >
            <div className="p-4 sm:p-6 lg:p-8">
              <PublishedOutputPreview winner={winner} />
            </div>

            <div className="flex flex-col justify-between border-t border-edge/10 p-7 lg:border-l lg:border-t-0 lg:p-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-surface/55">
                  {winner.metricLabel}
                </p>
                <p className="mt-5 text-5xl font-semibold tracking-[-0.05em] text-success sm:text-6xl">
                  {winner.metricValue}
                </p>
                <p className="mt-6 text-xl font-medium leading-8 text-surface">
                  {winner.title}
                </p>
                <p className="mt-4 text-sm leading-6 text-surface/65">
                  {winner.provenance}
                </p>
                <p className="mt-2 text-sm text-surface/45">
                  {winner.platform} &middot; {winner.mediaType}
                </p>
              </div>

              <Link
                className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-surface underline underline-offset-4 transition-colors hover:text-surface/80"
                href={winner.canonicalUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {winner.linkLabel}
                <ExternalLink className="size-4" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </WebSection>
  );
}

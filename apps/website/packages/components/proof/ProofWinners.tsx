import { getPublishedWinners } from '@data/winners.data';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import SectionHeader from '@ui/marketing/SectionHeader';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import Image from 'next/image';
import Link from 'next/link';

/**
 * Renders nothing until a piece is published with verified provenance and a
 * metric behind it. The column count follows the entry count, so a single
 * winner reads as a case study rather than a thin grid.
 */
export default function ProofWinners(): React.ReactElement | null {
  const publishedWinners = getPublishedWinners();

  if (publishedWinners.length === 0) {
    return null;
  }

  const columns = Math.min(publishedWinners.length, 3) as 1 | 2 | 3;

  return (
    <WebSection bg="bordered" maxWidth="xl" py="md">
      <SectionHeader
        className="[&_h2]:text-5xl mb-4"
        description="Published, with the numbers."
        title="Made in Genfeed."
      />

      <NeuralGrid columns={columns}>
        {publishedWinners.map((winner) => (
          <NeuralGridItem
            key={winner.id}
            className="flex flex-col gap-5"
            padding="lg"
            tierLabel={winner.metricLabel}
          >
            <div className="text-xs font-bold uppercase tracking-widest text-success">
              {winner.metricValue}
            </div>

            <p className="text-lg font-medium leading-8 text-surface">
              {winner.title}
            </p>

            {winner.previewSrc && (
              <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-card">
                <Image
                  alt={winner.previewAlt ?? winner.title}
                  className="object-cover"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 400px"
                  src={winner.previewSrc}
                />
              </div>
            )}

            <div className="mt-auto border-t border-edge/5 pt-5">
              <div className="text-sm text-surface/72">
                {winner.platform} &middot; {winner.mediaType} &middot;{' '}
                <time dateTime={winner.publishedAt}>
                  {formatDate(winner.publishedAt, DATE_FORMATS.DISPLAY_DATE)}
                </time>
              </div>

              <div className="mt-2 text-sm text-surface/72">
                {winner.provenance}
              </div>

              <Link
                className="mt-4 inline-block text-sm font-semibold text-surface underline underline-offset-4 transition-colors hover:text-surface/80"
                href={winner.canonicalUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {winner.linkLabel}
              </Link>
            </div>
          </NeuralGridItem>
        ))}
      </NeuralGrid>
    </WebSection>
  );
}

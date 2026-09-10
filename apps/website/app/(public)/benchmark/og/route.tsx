// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import { ImageResponse } from 'next/og';

import { loadSatoshiSatoriFonts } from '@genfeedai/fonts/og';

import {
  type BenchmarkData,
  getBenchmarkData,
} from '@public/benchmark/benchmark-loader';
import { BrandMark } from '@website/(content)/articles/[slug]/og/brand-mark';

/**
 * The bench's social card.
 *
 * This page exists to be shared the week a model ships, so the card carries the
 * standing itself rather than a fixed marketing image — a link posted after a
 * new contestant enters should look different from the same link posted last
 * month. An unplayed season says so in words instead of showing an empty box.
 *
 * A plain route handler rather than `opengraph-image.tsx`: that convention
 * hashes the route name when a route group sits in the parent path (`(public)`
 * here), so the URL cannot be written down — and `generateMetadata` needs to
 * name this image.
 */

const SIZE = { height: 630, width: 1200 };

const INK = '#08090B';
const PAPER = '#F5F3EF';
const ACCENT = '#C2410C';

interface CardLine {
  primary: string;
  secondary: string;
}

/** Top of the ladder, or an honest statement that there is no ladder yet. */
function buildLines(data: BenchmarkData | null): CardLine[] {
  if (!data) {
    return [{ primary: 'Bench unavailable', secondary: '' }];
  }

  if (data.season.ladder.length === 0) {
    return [
      {
        primary: `${data.season.contestantIds.length} contestants entered`,
        secondary: 'no matches recorded yet',
      },
    ];
  }

  return data.season.ladder.slice(0, 3).map((entry, index) => {
    const contestant = data.contestants.find(
      (one) => one.id === entry.contestantId,
    );

    return {
      primary: `${index + 1}. ${contestant?.label ?? entry.contestantId}`,
      secondary: `${Math.round(entry.rating)}`,
    };
  });
}

export async function GET(): Promise<ImageResponse> {
  const [data, fonts] = await Promise.all([
    getBenchmarkData().catch(() => null),
    loadSatoshiSatoriFonts(),
  ]);

  const lines = buildLines(data);
  const headline =
    data && data.season.ladder.length > 0
      ? data.season.title
      : (data?.season.title ?? 'Season One — Image');

  return new ImageResponse(
    <div
      style={{
        background: `radial-gradient(120% 140% at 8% 0%, #14161A 0%, ${INK} 58%)`,
        color: PAPER,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Satoshi',
        height: '100%',
        justifyContent: 'space-between',
        padding: 72,
        width: '100%',
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 18 }}>
        <BrandMark fill={PAPER} size={44} />
        <div
          style={{
            color: `${PAPER}99`,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          Benchmark
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginTop: 36,
          }}
        >
          {lines.map((line) => (
            <div
              key={line.primary}
              style={{
                alignItems: 'baseline',
                display: 'flex',
                fontSize: 34,
                gap: 16,
              }}
            >
              <div style={{ color: PAPER, display: 'flex', fontWeight: 500 }}>
                {line.primary}
              </div>
              {line.secondary ? (
                <div
                  style={{ color: ACCENT, display: 'flex', fontWeight: 700 }}
                >
                  {line.secondary}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          alignItems: 'center',
          borderTop: `1px solid ${PAPER}1F`,
          color: `${PAPER}8C`,
          display: 'flex',
          fontSize: 24,
          justifyContent: 'space-between',
          paddingTop: 26,
        }}
      >
        <div style={{ display: 'flex' }}>genfeed.ai/benchmark</div>
        <div style={{ display: 'flex' }}>
          Blind pairwise judging · public journal
        </div>
      </div>
    </div>,
    { ...SIZE, fonts },
  );
}

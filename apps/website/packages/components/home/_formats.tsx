import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { OutputFormat } from '@props/website/home.props';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';

const OUTPUT_FORMATS: OutputFormat[] = [
  {
    description: 'On-brand stills for every feed and story.',
    title: 'Images & posts',
  },
  {
    description: 'Hook-first video for TikTok, Reels, and Shorts.',
    title: 'Reels & short video',
  },
  {
    description: 'Episodes, clips, voiceovers, and audiograms.',
    title: 'Podcasts & voice',
  },
  {
    description: 'Editorial campaigns that reach the inbox.',
    title: 'Newsletters',
  },
  {
    description: 'Conversion-focused concepts, copy, and ratios.',
    title: 'Ads & creatives',
  },
  {
    description: 'Persistent branded personas across every channel.',
    title: 'AI influencers',
  },
  {
    description: 'Long-form content built to rank and be remembered.',
    title: 'Articles & SEO',
  },
  {
    description: 'Packaging, thumbnails, scripts, and finished video.',
    title: 'YouTube & thumbnails',
  },
];

export default function HomeFormats(): React.ReactElement {
  return (
    <section
      id="formats"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-16 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.55fr)] lg:items-end">
          <div className="flex flex-col gap-4">
            <Heading
              as="h2"
              className="max-w-3xl text-5xl font-semibold leading-tight tracking-[-0.04em] sm:text-6xl"
            >
              Every format you post.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              One system for the complete content presence.
            </Text>
          </div>

          <div className="lg:justify-self-end">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'see_pricing_formats' }}
              trackingName="home_formats_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href="/pricing">See pricing</Link>
            </ButtonTracked>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-x-12 border-t border-edge/5 sm:grid-cols-2">
          {OUTPUT_FORMATS.map((format, index) => (
            <li
              key={format.title}
              className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-edge/5 py-8"
            >
              <Text className="pt-1 text-[11px] font-bold tracking-[0.12em] text-surface/55">
                {String(index + 1).padStart(2, '0')}
              </Text>
              <div>
                <Heading
                  as="h3"
                  className="text-xl font-semibold tracking-[-0.025em] text-surface"
                >
                  {format.title}
                </Heading>
                <Text className="mt-2 text-sm leading-6 text-surface/72">
                  {format.description}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

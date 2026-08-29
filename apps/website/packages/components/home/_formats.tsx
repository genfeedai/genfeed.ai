import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { OutputFormat } from '@props/website/home.props';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_ASSETS } from '@web-components/home/_assets';
import Image from 'next/image';
import Link from 'next/link';

const OUTPUT_FORMATS: OutputFormat[] = [
  {
    description: 'On-brand stills for every feed and story.',
    image: HOME_ASSETS.formats.images,
    title: 'Images & posts',
  },
  {
    description: 'Hook-first video for TikTok, Reels, and Shorts.',
    image: HOME_ASSETS.formats.reels,
    title: 'Reels & short video',
  },
  {
    description: 'Ad creatives in every ratio, with copy variants.',
    image: HOME_ASSETS.formats.ads,
    title: 'Ad creatives',
  },
  {
    description: 'Lip-synced avatar clips. No camera needed.',
    image: HOME_ASSETS.formats.avatars,
    title: 'Avatar clips',
  },
  {
    description: 'Natural voiceovers for clips and podcasts.',
    image: HOME_ASSETS.formats.voice,
    title: 'Voiceovers',
  },
  {
    description: 'Long-form articles and SEO posts, captions included.',
    image: HOME_ASSETS.formats.articles,
    title: 'Articles & SEO',
  },
];

export default function HomeFormats(): React.ReactElement {
  return (
    <section
      id="formats"
      className="gen-section-spacing border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.55fr)] lg:items-end">
          <div className="flex flex-col gap-4">
            <Heading
              as="h2"
              className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
            >
              Every format you post.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              Six formats, one workspace.
            </Text>
          </div>

          <div className="lg:justify-self-end">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'see_pricing_formats' }}
              trackingName="formats_cta_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href="/pricing">See pricing</Link>
            </ButtonTracked>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-2 lg:grid-cols-3">
          {OUTPUT_FORMATS.map((format) => (
            <div
              key={format.title}
              className="group flex flex-col bg-background"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-card">
                <Image
                  alt={`${format.title} generated with Genfeed`}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  src={format.image}
                />
              </div>

              <div className="flex flex-col flex-1 gap-2 p-6">
                <Heading
                  as="h3"
                  className="text-lg font-semibold tracking-[-0.02em] text-surface"
                >
                  {format.title}
                </Heading>
                <Text className="text-sm leading-6 text-surface/72">
                  {format.description}
                </Text>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

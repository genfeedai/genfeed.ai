'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  AVATAR_CREDIT_COSTS,
  BYOK_CREDIT_VALUE_DOLLARS,
  INTERNAL_CREDIT_COSTS,
  VIDEO_CREDIT_COSTS,
} from '@helpers/business/pricing/pricing.helper';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import type { OutputFormat } from '@props/website/home.props';
import Image from 'next/image';
import { LuArrowRight } from 'react-icons/lu';

function formatCreditsPrice(credits: number): string {
  return `$${(credits * BYOK_CREDIT_VALUE_DOLLARS).toFixed(2)}`;
}

const OUTPUT_FORMATS: OutputFormat[] = [
  {
    credits: INTERNAL_CREDIT_COSTS.image,
    description:
      'On-brand stills for feeds, stories, and product drops, sized per platform.',
    image: '/images/home/formats/images.webp',
    title: 'Images & posts',
  },
  {
    credits: VIDEO_CREDIT_COSTS.video8s,
    description:
      'Hook-first short video rendered from the same brief, ready for TikTok, Reels, and Shorts.',
    image: '/images/home/formats/reels.webp',
    title: 'Reels & short video',
  },
  {
    credits: INTERNAL_CREDIT_COSTS.image,
    description:
      'Ad creatives in every ratio with copy variants you can A/B test the same day.',
    image: '/images/home/formats/ads.webp',
    title: 'Ad creatives',
  },
  {
    credits: AVATAR_CREDIT_COSTS.avatar4s,
    description:
      'Talking-head avatar clips with lip-synced voice. No camera, no reshoots.',
    image: '/images/home/formats/avatars.webp',
    title: 'Avatar clips',
  },
  {
    credits: INTERNAL_CREDIT_COSTS.voicePerMinute,
    description:
      'Natural voiceovers and audio reads for clips, podcasts, and dubs.',
    image: '/images/home/formats/voice.webp',
    priceSuffix: '/min',
    title: 'Voiceovers',
  },
  {
    credits: INTERNAL_CREDIT_COSTS.articlePerPost,
    description:
      'Long-form articles and SEO posts drafted from the brief, with captions included.',
    image: '/images/home/formats/articles.webp',
    title: 'Articles & SEO',
  },
];

export default function HomeFormats(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <section
      id="formats"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.55fr)] lg:items-end">
          <VStack className="gap-4">
            <Heading
              as="h2"
              className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
            >
              Every format, priced per output.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              You never pick a model. The Genfeed router sends every job to the
              best model for the format and brief. You just see the output and
              what it cost.
            </Text>
          </VStack>

          <div className="lg:justify-self-end">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'signup_formats' }}
              trackingName="formats_cta_click"
              variant={ButtonVariant.OUTLINE}
            >
              <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                Generate an asset
                <LuArrowRight className="size-3" />
              </a>
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

              <VStack className="flex-1 gap-2 p-6">
                <div className="flex items-baseline justify-between gap-4">
                  <Heading
                    as="h3"
                    className="text-lg font-semibold tracking-[-0.02em] text-surface"
                  >
                    {format.title}
                  </Heading>
                  <Text className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-surface/45">
                    from {format.credits.toLocaleString()} credits
                  </Text>
                </div>
                <Text className="text-sm leading-6 text-surface/55">
                  {format.description}
                </Text>
                <Text className="mt-auto pt-2 text-xs text-surface/40">
                  ≈ {formatCreditsPrice(format.credits)}
                  {format.priceSuffix ?? ''} at the pay-as-you-go rate
                </Text>
              </VStack>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

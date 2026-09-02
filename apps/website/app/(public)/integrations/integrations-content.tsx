'use client';

import { integrations } from '@data/integrations.data';
import { ButtonSize } from '@genfeedai/contracts';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import {
  DiscordIcon,
  FacebookIcon,
  GhostIcon,
  InstagramIcon,
  LinkedinIcon,
  MastodonIcon,
  MediumIcon,
  PinterestIcon,
  RedditIcon,
  ShopifyIcon,
  SlackIcon,
  SnapchatIcon,
  TelegramIcon,
  ThreadsIcon,
  TiktokIcon,
  TwitchIcon,
  WhatsappIcon,
  WordpressIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import { ArrowRight, Newspaper, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';

const ICON_MAP: Record<string, IconType> = {
  DiscordIcon,
  FacebookIcon,
  GhostIcon,
  InstagramIcon,
  LinkedinIcon,
  MastodonIcon,
  MediumIcon,
  PinterestIcon,
  RedditIcon,
  ShopifyIcon,
  SlackIcon,
  SnapchatIcon,
  Star,
  TelegramIcon,
  ThreadsIcon,
  TiktokIcon,
  TwitchIcon,
  WhatsappIcon,
  WordpressIcon,
  XTwitterIcon,
  YoutubeIcon,
  Newspaper,
};

const featuredIntegrations = integrations.slice(0, 4);

const HERO_PROOF = (
  <HeroProofRail
    items={[
      {
        label: 'Coverage',
        value: `${integrations.length}+ platform endpoints and content surfaces.`,
      },
      {
        label: 'Workflow',
        value:
          'Generate, optimize, schedule, and publish without leaving one system.',
      },
      {
        label: 'Focus',
        value:
          'One operating layer for distribution instead of disconnected tools.',
      },
    ]}
    title="Channel proof"
  />
);

const HERO_VISUAL = (
  <EditorialPoster
    detail="Each integration is tuned for channel-native output so the content system stays coherent while the platform behavior changes."
    eyebrow="Channel Map"
    footer={
      <span>{featuredIntegrations.map((item) => item.name).join(' / ')}</span>
    }
    items={featuredIntegrations.map((integration) => ({
      label: integration.name,
      value: integration.tagline,
    }))}
    subtitle="Distribution surfaces with AI-native packaging"
    title="Every channel, one layer."
  />
);

export default function IntegrationsContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        heroActions={
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingName="integrations_hero_click"
            trackingData={{ action: 'core_cta' }}
          >
            <Link href="/pricing">
              Get Started Free
              <ArrowRight className="size-4" />
            </Link>
          </ButtonTracked>
        }
        heroProof={HERO_PROOF}
        heroVisual={HERO_VISUAL}
        compact
        title="Integrations"
        description="Connect Genfeed to your favorite platforms. Generate and publish AI content everywhere."
      >
        {/* Platform Grid */}
        <section className="gsap-hero max-w-6xl mx-auto py-16 px-6">
          <div className="gsap-grid grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => {
              const Icon = ICON_MAP[integration.icon];
              return (
                <Link
                  key={integration.slug}
                  href={`/integrations/${integration.slug}`}
                  className="gsap-card group relative flex flex-col bg-background p-8 transition-colors hover:bg-fill/[0.02]"
                >
                  <div className="mb-5 flex size-14 items-center justify-center rounded-xl border border-edge/10 bg-fill/[0.06] transition-colors group-hover:border-[var(--gen-accent-border)] group-hover:bg-[var(--gen-accent-bg)]">
                    {Icon && (
                      <Icon className="size-7 text-surface/50 transition-colors group-hover:text-[color:hsl(var(--gen-accent))]" />
                    )}
                  </div>
                  <Heading
                    as="h3"
                    className="mb-2 text-lg font-semibold text-surface"
                  >
                    {integration.name}
                  </Heading>
                  <Text className="mb-6 flex-1 text-sm leading-relaxed text-surface/55">
                    {integration.tagline}
                  </Text>
                  <div className="flex flex-row items-center gap-1.5 text-xs font-medium text-surface/55 transition-colors group-hover:text-[color:hsl(var(--gen-accent))]">
                    <Text>Explore</Text>
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-12 text-center">
            <div className="flex justify-center mb-4">
              <Sparkles className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-surface">
              One Platform, Every Channel
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Generate AI content and publish to all your platforms from a
              single dashboard. Start free with Core.
            </Text>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="integrations_cta_click"
              trackingData={{ action: 'core_cta' }}
            >
              <Link href="/pricing">
                Get Started Free
                <ArrowRight className="size-4" />
              </Link>
            </ButtonTracked>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}

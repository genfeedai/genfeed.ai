import { integrations } from '@data/integrations.data';
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
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import MarketingEntrance from '@web-components/MarketingEntrance';
import EditorialPoster from '@web-components/marketing/EditorialPoster';
import HeroProofRail from '@web-components/marketing/HeroProofRail';
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
          'Your agent drafts and schedules. Publishing and analytics stay in one dashboard.',
      },
      {
        label: 'Focus',
        value: 'One set of connected channels for every agent you use.',
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
  return (
    <MarketingEntrance>
      <PageLayout
        heroMedia={
          <MarketingArtwork page="/integrations" isCompact kind="publishing" />
        }
        heroActions={
          <AgentFirstActions trackingName="integrations_hero_click" />
        }
        heroProof={HERO_PROOF}
        heroVisual={HERO_VISUAL}
        compact
        title="Integrations"
        description="Connect the channels your agent publishes to. It drafts and schedules, you review, and Genfeed publishes to the platforms you connect."
      >
        {/* Platform Grid */}
        <section className="gsap-hero max-w-6xl mx-auto py-16 px-6">
          <div className="gsap-grid grid grid-cols-1 gap-px bg-foreground/10 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => {
              const Icon = ICON_MAP[integration.icon];
              return (
                <Link
                  key={integration.slug}
                  href={`/integrations/${integration.slug}`}
                  className="gsap-card group relative flex flex-col bg-background p-8 transition-colors hover:bg-foreground/5"
                >
                  <div className="mb-5 flex size-14 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5 transition-colors group-hover:border-[var(--gen-accent-border)] group-hover:bg-[var(--gen-accent-bg)]">
                    {Icon && (
                      <Icon className="size-7 text-foreground/50 transition-colors group-hover:text-[color:hsl(var(--gen-accent))]" />
                    )}
                  </div>
                  <Heading
                    as="h3"
                    className="mb-2 text-lg font-semibold text-foreground"
                  >
                    {integration.name}
                  </Heading>
                  <Text className="mb-6 flex-1 text-sm leading-relaxed text-foreground/60">
                    {integration.tagline}
                  </Text>
                  <div className="flex flex-row items-center gap-1.5 text-xs font-medium text-foreground/60 transition-colors group-hover:text-[color:hsl(var(--gen-accent))]">
                    <Text>Explore</Text>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-6 sm:p-12 text-center">
            <div className="flex justify-center mb-4">
              <Sparkles className="size-8 text-foreground" />
            </div>
            <Heading
              as="h3"
              className="text-2xl font-bold mb-2 text-foreground"
            >
              Your agent, every channel
            </Heading>
            <Text as="p" className="text-foreground/70 mb-6 max-w-lg mx-auto">
              Connect your agent, then connect your channels. Review drafts and
              publish to your platforms from one dashboard.
            </Text>
            <div className="flex flex-row flex-wrap items-center justify-center gap-4">
              <AgentFirstActions trackingName="integrations_cta_click" />
            </div>
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}

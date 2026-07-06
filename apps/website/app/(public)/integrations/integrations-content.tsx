'use client';

import { integrations } from '@data/integrations.data';
import { ButtonSize } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack } from '@ui/layout/stack';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import type { IconType } from 'react-icons';
import {
  FaDiscord,
  FaFacebook,
  FaGhost,
  FaInstagram,
  FaLinkedin,
  FaMastodon,
  FaMedium,
  FaPinterest,
  FaReddit,
  FaShopify,
  FaSlack,
  FaSnapchat,
  FaStar,
  FaTelegram,
  FaThreads,
  FaTiktok,
  FaTwitch,
  FaWhatsapp,
  FaWordpress,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { HiNewspaper, HiSparkles } from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

const ICON_MAP: Record<string, IconType> = {
  FaDiscord,
  FaFacebook,
  FaGhost,
  FaInstagram,
  FaLinkedin,
  FaMastodon,
  FaMedium,
  FaPinterest,
  FaReddit,
  FaShopify,
  FaSlack,
  FaSnapchat,
  FaStar,
  FaTelegram,
  FaThreads,
  FaTiktok,
  FaTwitch,
  FaWhatsapp,
  FaWordpress,
  FaXTwitter,
  FaYoutube,
  HiNewspaper,
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
              <LuArrowRight className="size-4" />
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
          <div className="gsap-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((integration) => {
              const Icon = ICON_MAP[integration.icon];
              return (
                <Link
                  key={integration.slug}
                  href={`/integrations/${integration.slug}`}
                  className="gsap-card group relative flex flex-col border border-edge/5 bg-fill/[0.02] p-8 transition-all duration-300 hover:border-[var(--gen-accent-hover)] hover:bg-fill/[0.05] hover:shadow-[0_8px_40px_rgba(0,0,0,0.25)]"
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
                  <Text className="mb-6 flex-1 text-sm leading-relaxed text-surface/45">
                    {integration.tagline}
                  </Text>
                  <HStack className="items-center gap-1.5 text-xs font-medium text-surface/25 transition-colors group-hover:text-[color:hsl(var(--gen-accent))]">
                    <Text>Explore</Text>
                    <LuArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </HStack>
                </Link>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="text-center p-12 border border-[var(--gen-accent-border)] bg-white/[0.04]">
            <div className="flex justify-center mb-4">
              <HiSparkles className="size-8 text-surface" />
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
                <LuArrowRight className="size-4" />
              </Link>
            </ButtonTracked>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}

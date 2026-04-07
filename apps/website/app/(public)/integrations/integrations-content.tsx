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

export default function IntegrationsContent() {
  const containerRef = useMarketingEntrance();
  const featuredIntegrations = integrations.slice(0, 4);

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
              <LuArrowRight className="h-4 w-4" />
            </Link>
          </ButtonTracked>
        }
        heroProof={
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
        }
        heroVisual={
          <EditorialPoster
            detail="Each integration is tuned for channel-native output so the content system stays coherent while the platform behavior changes."
            eyebrow="Channel Map"
            footer={
              <span>
                {featuredIntegrations.map((item) => item.name).join(' / ')}
              </span>
            }
            items={featuredIntegrations.map((integration) => ({
              label: integration.name,
              value: integration.tagline,
            }))}
            subtitle="Distribution surfaces with AI-native packaging"
            title={
              <>
                Every channel.
                <br />
                One operating
                <br />
                layer.
              </>
            }
          />
        }
        title="Integrations"
        description="Connect Genfeed to your favorite platforms. Generate and publish AI content everywhere."
      >
        {/* Platform Grid */}
        <section className="gsap-hero max-w-6xl mx-auto py-16 px-6">
          <div className="gsap-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {integrations.map((integration) => {
              const Icon = ICON_MAP[integration.icon];
              return (
                <Link
                  key={integration.slug}
                  href={`/integrations/${integration.slug}`}
                  className="gsap-card group gen-card-spotlight p-8 bg-fill/[0.02] hover:bg-fill/[0.04] transition-colors block"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] flex-shrink-0">
                      {Icon && (
                        <Icon className="h-6 w-6 text-[color:hsl(var(--gen-accent))]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <Heading
                        as="h3"
                        className="font-semibold text-surface/90 mb-1"
                      >
                        {integration.name}
                      </Heading>
                      <Text className="text-sm text-surface/40 line-clamp-2">
                        {integration.tagline}
                      </Text>
                    </div>
                  </div>
                  <HStack className="mt-4 items-center gap-1 text-xs text-[color:hsl(var(--gen-accent))] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <Text>Learn More</Text>
                    <LuArrowRight className="h-3 w-3" />
                  </HStack>
                </Link>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="text-center p-12 bg-[hsl(var(--gen-accent))] shadow-[var(--shadow-glow-md)]">
            <div className="flex justify-center mb-4">
              <HiSparkles className="h-8 w-8 text-inv-fg" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-inv-fg">
              One Platform, Every Channel
            </Heading>
            <Text as="p" className="text-inv-fg/60 mb-6 max-w-lg mx-auto">
              Generate AI content and publish to all your platforms from a
              single dashboard. Start free with Core.
            </Text>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              className="bg-inv-fg text-[color:hsl(var(--gen-accent))] hover:bg-inv-fg/80 px-8 py-3 text-xs font-bold uppercase tracking-wider"
              trackingName="integrations_cta_click"
              trackingData={{ action: 'core_cta' }}
            >
              <Link href="/pricing">
                Get Started Free
                <LuArrowRight className="h-4 w-4" />
              </Link>
            </ButtonTracked>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}

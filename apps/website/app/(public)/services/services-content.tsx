'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { contentServiceOffering } from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { LuCheck, LuSparkles } from 'react-icons/lu';

const SERVICE_CARDS = [
  {
    cta: 'Book a Call',
    ctaHref: EnvironmentService.calendly,
    description: contentServiceOffering.description,
    features: contentServiceOffering.includes,
    label: 'Done-For-You',
    number: '01',
    price: 'From $2,500/mo',
    shortLabel: 'Content',
  },
  {
    cta: 'Book a Call',
    ctaHref: EnvironmentService.calendly,
    description:
      'Setup packages and custom workshops to get your team productive on the platform fast.',
    features: [
      'Platform setup and configuration',
      'Custom training workshops',
      'Brand kit setup',
      'Integration walkthroughs',
      'Ongoing email support',
    ],
    label: 'Training & Onboarding',
    number: '02',
    price: 'From $299',
    shortLabel: 'Training',
  },
  {
    cta: 'Book a Call',
    ctaHref: EnvironmentService.calendly,
    description:
      'Content strategy, brand positioning, and channel optimization for teams that need direction before execution.',
    features: [
      'Content strategy audit',
      'Brand positioning workshop',
      'Channel mix optimization',
      'Content calendar design',
      'Performance framework setup',
    ],
    label: 'Content Consultancy',
    number: '03',
    price: 'Custom',
    shortLabel: 'Strategy',
  },
];

export default function ServicesContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Services"
        badgeIcon={LuSparkles}
        compact
        title={<>Professional services.</>}
        description="Let us create for you, get your team up to speed, or plan your content strategy."
      >
        <WebSection maxWidth="full">
          <SectionHeader
            title="How We Can Help"
            description="Expert content services for agencies and brands that need more than software."
            className="[&_h2]:text-5xl mb-4"
          />
          <NeuralGrid columns={3}>
            {SERVICE_CARDS.map((service, index) => {
              const isFeatured = index === 0;

              return (
                <NeuralGridItem
                  key={service.label}
                  padding="lg"
                  className={cn(
                    'relative gsap-card',
                    isFeatured && 'bg-white/[0.04]',
                  )}
                >
                  {isFeatured && (
                    <div className="absolute top-6 right-6">
                      <span className="border border-edge/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-surface/70">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="text-xs font-black uppercase tracking-widest mb-6 text-surface/50">
                    {service.number} / {service.shortLabel}
                  </div>

                  <div className="mb-2">
                    <span className="text-3xl font-semibold text-surface">
                      {service.label}
                    </span>
                  </div>

                  <div className="text-sm mb-4 text-surface/60">
                    {service.price}
                  </div>

                  <div className="text-sm mb-8 text-surface/65">
                    {service.description}
                  </div>

                  <ul className="space-y-4 mb-auto">
                    {service.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <LuCheck className="size-4 mt-0.5 shrink-0 text-surface/55" />
                        <span className="text-sm text-surface/65">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    variant={
                      isFeatured ? ButtonVariant.WHITE : ButtonVariant.OUTLINE
                    }
                    size={ButtonSize.PUBLIC}
                    className="mt-12 w-full text-center"
                  >
                    <a
                      href={service.ctaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {service.cta}
                    </a>
                  </Button>
                </NeuralGridItem>
              );
            })}
          </NeuralGrid>
        </WebSection>

        {/* Service landing pages */}
        <WebSection bg="bordered" maxWidth="md" className="gsap-section">
          <SectionHeader
            title="Specialized Services"
            description="Deep-dive service pages for specific content needs."
            className="[&_h2]:text-5xl"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {[
              {
                href: '/done-for-you',
                label: 'Done-For-You Content',
              },
              {
                href: '/founder-content',
                label: 'Founder Content',
              },
              {
                href: '/linkedin-content',
                label: 'LinkedIn Content',
              },
              {
                href: '/podcast-to-content',
                label: 'Podcast to Content',
              },
              {
                href: '/launch-content',
                label: 'Launch Content',
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between p-4 border border-edge/10 bg-fill/[0.02] hover:border-surface/20 transition-all"
              >
                <span className="text-xs font-black uppercase tracking-widest text-surface/60">
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-surface">→</span>
              </Link>
            ))}
          </div>
        </WebSection>

        {/* CTA */}
        <CtaSection
          bg="subtle"
          title="Ready to Talk?"
          description="Tell us about your content needs and we will scope the right engagement."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a
              href={EnvironmentService.calendly}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a Call
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <Link href="/pricing">View Platform Plans</Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}

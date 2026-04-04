'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import FaqGrid from '@web-components/content/FaqGrid';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import LandingFooter from '@web-components/landing/LandingFooter';
import type { ServiceLandingConfig } from '@web-components/landing/service-landings.data';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { LuBadgeCheck, LuCalendarRange, LuSparkles } from 'react-icons/lu';

export interface ServiceLandingPageProps {
  config: ServiceLandingConfig;
}

export default function ServiceLandingPage({
  config,
}: ServiceLandingPageProps): React.ReactElement {
  const containerRef = useMarketingEntrance({ cards: false });

  return (
    <div ref={containerRef}>
      <PageLayout
        badge={config.badge}
        badgeIcon={LuSparkles}
        title={
          <>
            {config.heroTitle}{' '}
            <span className="italic font-light">{config.heroAccent}</span>.
          </>
        }
        description={config.heroDescription}
        showFooter={false}
      >
        <WebSection maxWidth="md" className="pt-0">
          <div className="grid gap-8 border border-edge/5 bg-fill/[0.02] p-8 md:grid-cols-[1.4fr_0.8fr] md:p-12">
            <div>
              <p className="mb-6 text-lg leading-relaxed text-surface/70">
                {config.intro}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-sm text-surface/45">
                <span className="border border-edge/10 px-3 py-2">
                  Starting from $2,500
                </span>
                <span className="border border-edge/10 px-3 py-2">
                  Primary CTA: Book a Call
                </span>
              </div>
            </div>

            <div className="border border-edge/10 bg-black/30 p-6">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-surface/35">
                <LuCalendarRange className="h-4 w-4" />
                {config.fitLabel}
              </div>
              <ul className="space-y-4">
                {config.fitSignals.map((signal) => (
                  <li
                    key={signal}
                    className="flex gap-3 text-sm text-surface/65"
                  >
                    <LuBadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-surface/35" />
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </WebSection>

        <WebSection maxWidth="xl" className="gsap-section">
          <SectionHeader
            title={config.outcomesTitle}
            description={config.outcomesDescription}
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={3}>
            {config.outcomes.map((outcome) => (
              <NeuralGridItem
                key={outcome.title}
                icon={outcome.icon}
                title={outcome.title}
                description={outcome.description}
                className="gsap-card"
                padding="lg"
              />
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="xl" className="gsap-section">
          <SectionHeader
            title={config.deliverablesTitle}
            description={config.deliverablesDescription}
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={3}>
            {config.deliverableBuckets.map((bucket) => (
              <NeuralGridItem
                key={bucket.title}
                title={bucket.title}
                padding="lg"
              >
                <ul className="space-y-3">
                  {bucket.items.map((item) => (
                    <li
                      key={item}
                      className="border-b border-edge/5 pb-3 text-sm text-surface/60 last:border-b-0 last:pb-0"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </NeuralGridItem>
            ))}
          </NeuralGrid>

          <div className="mt-8 grid gap-3 border border-edge/5 bg-fill/[0.02] p-6 sm:grid-cols-2 lg:grid-cols-4">
            {config.includes.map((item) => (
              <div
                key={item}
                className="border border-edge/10 px-4 py-4 text-sm text-surface/60"
              >
                {item}
              </div>
            ))}
          </div>
        </WebSection>

        <WebSection maxWidth="xl" className="gsap-section">
          <SectionHeader
            title={config.processTitle}
            description={config.processDescription}
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={4}>
            {config.process.map((step, index) => (
              <NeuralGridItem
                key={step.step}
                tierLabel={`0${index + 1} / ${step.step}`}
                padding="lg"
                className={cn(
                  index === 0 && 'bg-fill/[0.02]',
                  index === config.process.length - 1 && 'bg-fill/[0.02]',
                )}
              >
                <p className="text-sm leading-relaxed text-surface/60">
                  {step.description}
                </p>
              </NeuralGridItem>
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="md" className="gsap-section">
          <SectionHeader
            title={config.faqTitle}
            description={config.faqDescription}
            className="[&_h2]:text-5xl"
          />

          <FaqGrid items={config.faqs} />
        </WebSection>

        <CtaSection
          bg="subtle"
          title={config.closingTitle}
          description={config.closingDescription}
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <Link
              href={EnvironmentService.calendly}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a Call
            </Link>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <Link href="/">Back to Genfeed.ai</Link>
          </Button>
        </CtaSection>
      </PageLayout>

      <LandingFooter />
    </div>
  );
}

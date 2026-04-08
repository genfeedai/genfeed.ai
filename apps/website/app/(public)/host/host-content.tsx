'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import FeatureList from '@web-components/content/FeatureList';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Image from 'next/image';
import Link from 'next/link';
import {
  LuArrowRight,
  LuDollarSign,
  LuLock,
  LuServer,
  LuSettings,
  LuShieldCheck,
} from 'react-icons/lu';

const benefits = [
  {
    description:
      'Your content stays on your servers. Full control over your data.',
    icon: LuLock,
    shortLabel: 'Privacy',
    title: 'Data Sovereignty',
  },
  {
    description: 'Use your own AI API keys. Pay only for what you use.',
    icon: LuDollarSign,
    shortLabel: 'Savings',
    title: 'Cost Control',
  },
  {
    description: 'Modify the source code. Integrate with your existing tools.',
    icon: LuSettings,
    shortLabel: 'Flexibility',
    title: 'Full Customization',
  },
  {
    description: 'Open source license. Export anytime. Your data, your rules.',
    icon: LuShieldCheck,
    shortLabel: 'Freedom',
    title: 'No Vendor Lock-in',
  },
];

const requirements = {
  minimum: {
    cpu: '4 cores',
    label: 'Minimum',
    ram: '8GB',
    services: ['Docker', 'MongoDB', 'Redis'],
    shortLabel: 'Dev / Testing',
    storage: '50GB SSD',
  },
  recommended: {
    cpu: '8+ cores',
    label: 'Recommended',
    ram: '16GB+',
    services: ['Docker', 'MongoDB', 'Redis', 'S3-compatible storage'],
    shortLabel: 'Production',
    storage: '100GB+ SSD',
  },
};

const deploymentOptions = [
  { difficulty: 'Easy', name: 'Docker Compose' },
  { difficulty: 'Easy', name: 'Railway / Render' },
  { difficulty: 'Medium', name: 'AWS / GCP / Azure' },
  { difficulty: 'Advanced', name: 'Kubernetes' },
];

export default function HostContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Infrastructure"
        badgeIcon={LuServer}
        title={
          <>
            Self <span className="italic font-light">Host</span>
          </>
        }
        description="Deploy the complete AI content platform on your own infrastructure"
      >
        {/* Quick Start */}
        <WebSection maxWidth="md" className="gsap-hero">
          <NeuralGrid columns={1}>
            <NeuralGridItem padding="lg">
              <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                01 / Quick Start
              </div>
              <h2 className="text-2xl font-bold mb-4">
                Get running in under 5 minutes
              </h2>
              <p className="text-surface/50 mb-8 max-w-xl">
                Bootstrap a self-hosted Genfeed workspace with one command.
                Dependencies install automatically and onboarding opens locally.
              </p>

              {/* Terminal */}
              <div className="bg-black/40 border border-edge/10 p-6 font-mono text-sm mb-8 overflow-x-auto">
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <span className="text-surface/30">$</span>
                    <span className="text-surface/80">
                      npx @genfeedai/create my-genfeed-app
                    </span>
                  </div>
                </div>
              </div>

              {/* Infrastructure Image */}
              <div className="relative aspect-[21/9] overflow-hidden mb-8">
                <Image
                  src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&q=80&fit=crop"
                  alt="Server infrastructure and data center"
                  fill
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
              </div>

              <Button
                asChild
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.SECONDARY}
                className="px-8 py-4"
              >
                <a
                  href="https://docs.genfeed.ai/core"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Full Guide
                  <LuArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </NeuralGridItem>
          </NeuralGrid>
        </WebSection>

        {/* Benefits */}
        <WebSection bg="subtle">
          <SectionHeader
            title="Why Self-Host?"
            description="Complete control over your data, costs, and customizations."
            className="[&_h2]:text-5xl [&_p]:max-w-xl"
          />

          <NeuralGrid columns={4} className="gsap-grid">
            {benefits.map((benefit, index) => (
              <NeuralGridItem
                key={benefit.title}
                className="gsap-card"
                tierLabel={`${String(index + 1).padStart(2, '0')} / ${benefit.shortLabel}`}
                icon={benefit.icon}
                title={benefit.title}
                description={benefit.description}
              />
            ))}
          </NeuralGrid>
        </WebSection>

        {/* Requirements */}
        <WebSection maxWidth="md" className="gsap-section">
          <SectionHeader
            title="System Requirements"
            description="Genfeed runs on modest hardware. Scale up as you grow."
            className="[&_h2]:text-5xl [&_p]:max-w-xl"
          />

          <NeuralGrid columns={2}>
            {(['minimum', 'recommended'] as const).map((tier, index) => {
              const req = requirements[tier];
              return (
                <NeuralGridItem
                  key={tier}
                  padding="lg"
                  tierLabel={`${String(index + 1).padStart(2, '0')} / ${req.shortLabel}`}
                >
                  <h3 className="text-2xl font-bold mb-6">{req.label}</h3>
                  <FeatureList
                    features={[
                      `CPU: ${req.cpu}`,
                      `RAM: ${req.ram}`,
                      `Storage: ${req.storage}`,
                      `Services: ${req.services.join(', ')}`,
                    ]}
                  />
                </NeuralGridItem>
              );
            })}
          </NeuralGrid>
        </WebSection>

        {/* Deployment Options */}
        <WebSection bg="subtle" className="gsap-section">
          <SectionHeader
            title="Deployment Options"
            description="Deploy anywhere. From simple Docker to enterprise Kubernetes."
            className="[&_h2]:text-5xl [&_p]:max-w-xl"
          />

          <NeuralGrid columns={4}>
            {deploymentOptions.map((option, index) => (
              <NeuralGridItem
                key={option.name}
                align="center"
                tierLabel={String(index + 1).padStart(2, '0')}
              >
                <h3 className="text-lg font-bold mb-4">{option.name}</h3>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-fill/10 text-surface/60">
                  {option.difficulty}
                </span>
              </NeuralGridItem>
            ))}
          </NeuralGrid>
        </WebSection>

        {/* Final CTA */}
        <CtaSection
          title="Ready to Deploy?"
          description="Follow our comprehensive self-hosting guide for step-by-step instructions, troubleshooting, and best practices."
        >
          <Button
            asChild
            size={ButtonSize.PUBLIC}
            variant={ButtonVariant.SECONDARY}
          >
            <a
              href="https://docs.genfeed.ai/core"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read Documentation
            </a>
          </Button>
          <Button
            asChild
            size={ButtonSize.PUBLIC}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href="/cloud">Compare with Cloud</Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}

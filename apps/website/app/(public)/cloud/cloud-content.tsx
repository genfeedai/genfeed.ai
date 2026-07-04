'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Image from 'next/image';
import {
  HiLifebuoy,
  HiServerStack,
  HiShieldCheck,
  HiSparkles,
  HiUserGroup,
} from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

const BENEFITS = [
  {
    description:
      'We handle servers, databases, updates, and security for teams that need shared workspaces.',
    icon: HiServerStack,
    shortLabel: 'Infra',
    title: 'Zero DevOps',
  },
  {
    description:
      'Teams, roles, organization boundaries, brand workspaces, and approval flows.',
    icon: HiShieldCheck,
    shortLabel: 'Teams',
    title: 'Collaboration Layer',
  },
  {
    description:
      'Separate brands, clients, and organizations without turning every workspace into a one-off setup.',
    icon: HiSparkles,
    shortLabel: 'Brands',
    title: 'Multi-Brand Ops',
  },
  {
    description:
      'Priority support, managed billing, and uptime expectations for production teams.',
    icon: HiLifebuoy,
    shortLabel: 'Support',
    title: 'Priority Support',
  },
];

const TEAMS = [
  {
    description:
      'Create, review, and publish content across shared workspaces.',
    title: 'Marketing Teams',
  },
  {
    description:
      'Manage clients, organizations, brands, and approvals in one managed environment.',
    title: 'Content Agencies',
  },
  {
    description:
      'Keep multiple brand systems separate while centralizing billing and operations.',
    title: 'Multi-Brand Operators',
  },
];

export default function CloudContent() {
  const containerRef = useMarketingEntrance();
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <div ref={containerRef}>
      <PageLayout
        title={<>Genfeed Cloud App</>}
        description="The managed path for creating, approving, publishing, and paying as you go for output."
      >
        {/* Benefits */}
        <WebSection maxWidth="xl">
          <NeuralGrid columns={4} className="gsap-grid">
            {BENEFITS.map((benefit, index) => (
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

        {/* Dashboard Preview */}
        <WebSection maxWidth="lg" bg="subtle">
          <div className="border border-edge/5 overflow-hidden">
            {/* Browser chrome */}
            <div className="bg-fill/[0.03] px-4 py-3 border-b border-edge/5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="size-3 rounded-full bg-fill/20" />
                  <div className="size-3 rounded-full bg-fill/20" />
                  <div className="size-3 rounded-full bg-fill/20" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-fill/[0.03] border border-edge/5 px-3 py-1.5 text-xs text-surface/30 text-center font-mono uppercase tracking-widest">
                    cloud.genfeed.ai
                  </div>
                </div>
              </div>
            </div>
            {/* Dashboard content */}
            <div className="relative aspect-[16/9]">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-white/[0.02]" />
              <div className="absolute inset-0 p-6">
                <div className="grid grid-cols-3 gap-1.5 h-full">
                  {[
                    {
                      alt: 'Cloud content - fashion',
                      src: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80&fit=crop',
                    },
                    {
                      alt: 'Cloud content - video',
                      src: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&q=80&fit=crop',
                    },
                    {
                      alt: 'Cloud content - creative',
                      src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80&fit=crop',
                    },
                  ].map((img) => (
                    <div key={img.alt} className="relative overflow-hidden">
                      <Image
                        src={img.src}
                        alt={img.alt}
                        fill
                        sizes="(max-width: 768px) 33vw, 25vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </WebSection>

        {/* Who is it for */}
        <WebSection maxWidth="xl" className="gsap-section">
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-6">
              <HiUserGroup className="size-5 text-surface/40" />
              <span className="text-xs font-black uppercase tracking-widest text-surface/20">
                Built for Growing Teams
              </span>
            </div>
            <p className="text-surface/50 max-w-xl mx-auto">
              Built for agencies, marketing teams, and operators managing
              multiple brands or organizations
            </p>
          </div>

          <NeuralGrid columns={3}>
            {TEAMS.map((team, index) => (
              <NeuralGridItem
                key={team.title}
                tierLabel={String(index + 1).padStart(2, '0')}
                title={team.title}
                description={team.description}
              />
            ))}
          </NeuralGrid>
        </WebSection>

        {/* Pricing CTA */}
        <CtaSection
          title="Start with the cloud app."
          description="Book a demo when collaboration, multi-brand rollout, or enterprise terms need design first."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a href={signUpHref} target="_blank" rel="noopener noreferrer">
              Start Creating Free
              <LuArrowRight className="size-4" />
            </a>
          </Button>
          <Button
            size={ButtonSize.PUBLIC}
            variant={ButtonVariant.SECONDARY}
            asChild
          >
            <a
              href={EnvironmentService.calendly}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a Demo
            </a>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}

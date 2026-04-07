'use client';

import { ButtonSize } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
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
  HiCheck,
  HiCloud,
  HiCpuChip,
  HiLifebuoy,
  HiServerStack,
  HiShieldCheck,
  HiSparkles,
  HiUserGroup,
  HiXMark,
} from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

const BENEFITS = [
  {
    description:
      'We handle servers, databases, updates, and security. You focus on creating content.',
    icon: HiServerStack,
    shortLabel: 'Infra',
    title: 'Zero DevOps',
  },
  {
    description:
      'SSO, audit logs, team management, and role-based access control included.',
    icon: HiShieldCheck,
    shortLabel: 'Security',
    title: 'Enterprise Features',
  },
  {
    description:
      'GPT-4, Claude, Gemini, and 10+ premium AI models ready to use out of the box.',
    icon: HiSparkles,
    shortLabel: 'Models',
    title: 'Premium AI Models',
  },
  {
    description:
      'Dedicated support team, 99.9% uptime SLA, and priority issue resolution.',
    icon: HiLifebuoy,
    shortLabel: 'Support',
    title: 'Priority Support',
  },
];

interface ComparisonRow {
  cloud: boolean | string;
  core: boolean | string;
  feature: string;
}

const COMPARISON_DATA: ComparisonRow[] = [
  { cloud: '10+ included', core: 'Bring your own', feature: 'AI Models' },
  { cloud: 'Fully managed', core: 'Self-managed', feature: 'Infrastructure' },
  { cloud: 'Dedicated team', core: 'Community', feature: 'Support' },
  { cloud: true, core: false, feature: 'SSO / SAML' },
  { cloud: true, core: false, feature: 'Audit Logs' },
  { cloud: 'Automatic', core: 'Manual', feature: 'Updates' },
  { cloud: '99.9% SLA', core: 'Self-managed', feature: 'Uptime' },
  { cloud: true, core: true, feature: 'API Access' },
  { cloud: true, core: true, feature: 'White-Label' },
];

const TEAMS = [
  {
    description: 'Create and publish content without technical overhead.',
    title: 'Marketing Teams',
  },
  {
    description: 'Manage multiple clients with team workspaces.',
    title: 'Content Agencies',
  },
  {
    description: 'Scale content production as you grow.',
    title: 'Startups',
  },
];

function ComparisonValue({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value ? (
      <HiCheck className="h-5 w-5 text-green-500 mx-auto" />
    ) : (
      <HiXMark className="h-5 w-5 text-surface/20 mx-auto" />
    );
  }
  return <span className="text-sm">{value}</span>;
}

export default function CloudContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Managed Platform"
        badgeIcon={HiCloud}
        title={
          <>
            Genfeed <span className="italic font-light">Cloud</span>
          </>
        }
        description="Focus on content, not servers. Managed AI platform for teams."
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
                  <div className="w-3 h-3 rounded-full bg-fill/20" />
                  <div className="w-3 h-3 rounded-full bg-fill/20" />
                  <div className="w-3 h-3 rounded-full bg-fill/20" />
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
              <HiUserGroup className="h-5 w-5 text-surface/40" />
              <span className="text-xs font-black uppercase tracking-widest text-surface/20">
                Built for Growing Teams
              </span>
            </div>
            <p className="text-surface/50 max-w-xl mx-auto">
              Perfect for SMBs, agencies, and startups
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

        {/* Comparison Table */}
        <WebSection maxWidth="lg" bg="subtle" className="gsap-section">
          <div className="text-center mb-16">
            <h3 className="text-5xl font-serif mb-6">Core vs Cloud</h3>
          </div>

          <div className="border border-edge/5 overflow-hidden">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b border-edge/5 bg-fill/[0.02]">
                  <TableHead className="text-left py-4 px-6 text-xs font-black uppercase tracking-widest text-surface/30">
                    Feature
                  </TableHead>
                  <TableHead className="text-center py-4 px-6 text-xs font-black uppercase tracking-widest text-surface/30">
                    <div className="flex items-center justify-center gap-2">
                      <HiCpuChip className="h-4 w-4" />
                      Core
                    </div>
                  </TableHead>
                  <TableHead className="text-center py-4 px-6 text-xs font-black uppercase tracking-widest text-surface/30">
                    <div className="flex items-center justify-center gap-2">
                      <HiCloud className="h-4 w-4" />
                      Cloud
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COMPARISON_DATA.map((row) => (
                  <TableRow
                    key={row.feature}
                    className="border-b border-edge/5 last:border-0 hover:bg-fill/[0.02] transition-colors"
                  >
                    <TableCell className="py-4 px-6 font-medium text-sm">
                      {row.feature}
                    </TableCell>
                    <TableCell className="py-4 px-6 text-center text-surface/50">
                      <ComparisonValue value={row.core} />
                    </TableCell>
                    <TableCell className="py-4 px-6 text-center">
                      <ComparisonValue value={row.cloud} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </WebSection>

        {/* Pricing CTA */}
        <CtaSection
          title="Ready to Get Started?"
          description="Start with Core for free or choose a managed plan. Upgrade when you need more power."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <Link href="/pricing">
              View Pricing
              <LuArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}

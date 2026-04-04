'use client';

import { gsapPresets, useGsapEntrance } from '@hooks/ui/use-gsap-entrance';
import Card from '@ui/card/Card';
import PricingStrip from '@ui/marketing/PricingStrip';
import PageLayout from '@web-components/PageLayout';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import {
  HiArrowRight,
  HiBuildingOffice,
  HiChartBar,
  HiCodeBracket,
  HiCpuChip,
  HiUserGroup,
} from 'react-icons/hi2';

const METRICS = [
  {
    after: '4 hrs/week',
    before: '40 hrs/week',
    label: 'Content Production',
  },
  {
    after: '15+ clients',
    before: '3 clients max',
    label: 'Per Account Manager',
  },
  {
    after: '30 videos/day',
    before: '3 videos/day',
    label: 'Output Capacity',
  },
];

const FEATURES = [
  {
    description:
      'Separate workspaces for each client. Switch between brands instantly.',
    icon: HiBuildingOffice,
    title: 'Multi-Brand Management',
  },
  {
    description:
      'Remove Genfeed branding. Deliver content as if it came from your agency.',
    icon: HiCpuChip,
    title: 'White-Label Export',
  },
  {
    description:
      'Role-based access. Clients can approve content without seeing your workflow.',
    icon: HiUserGroup,
    title: 'Team Collaboration',
  },
  {
    description:
      'Full REST API access. Integrate with your existing tools and workflows.',
    icon: HiCodeBracket,
    title: 'API Access',
  },
];

const USE_CASES = [
  {
    description:
      'Manage social media for multiple brands from one dashboard. Each client gets their own workspace.',
    imageUrl:
      'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&q=80&fit=crop',
    title: 'Social Media Management',
  },
  {
    description:
      'Generate ad creatives at scale. A/B test variations without hiring more designers.',
    imageUrl:
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80&fit=crop',
    title: 'Performance Marketing',
  },
  {
    description:
      'Create blog posts, social content, and newsletters for clients in minutes instead of hours.',
    imageUrl:
      'https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?w=600&q=80&fit=crop',
    title: 'Content Marketing',
  },
];

export default function AgenciesContent() {
  const animations = useMemo(
    () => [
      gsapPresets.fadeUp('.gsap-hero'),
      gsapPresets.staggerCards('.gsap-card', '.gsap-grid'),
      gsapPresets.fadeUp('.gsap-section', '.gsap-section'),
    ],
    [],
  );

  const containerRef = useGsapEntrance({ animations });

  return (
    <div ref={containerRef}>
      <PageLayout
        title="For Agencies"
        description="Scale content production 10x. Give every client the content volume of an in-house team."
      >
        {/* Before/After Metrics */}
        <section className="gsap-hero max-w-4xl mx-auto pb-16">
          <div className="gsap-grid grid grid-cols-1 md:grid-cols-3 gap-6">
            {METRICS.map((metric) => (
              <Card key={metric.label} className="gsap-card text-center">
                <p className="text-sm text-foreground/60 mb-4">
                  {metric.label}
                </p>
                <div className="space-y-2">
                  <p className="text-foreground/50 line-through">
                    {metric.before}
                  </p>
                  <p className="text-3xl font-bold text-primary">
                    {metric.after}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Value Prop */}
        <section className="max-w-4xl mx-auto pb-16">
          <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="p-6 bg-primary/10">
                  <HiChartBar className="h-16 w-16 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">
                  More Clients, Same Team
                </h3>
                <p className="text-foreground/70 mb-4">
                  Stop turning away clients because you don&apos;t have the
                  capacity. Genfeed lets your team produce 10x more content
                  without hiring more people.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-background/50 text-sm">
                    No new hires
                  </span>
                  <span className="px-3 py-1 rounded-full bg-background/50 text-sm">
                    Predictable costs
                  </span>
                  <span className="px-3 py-1 rounded-full bg-background/50 text-sm">
                    Higher margins
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Features */}
        <section className="gsap-section max-w-6xl mx-auto pb-16">
          <h3 className="text-2xl font-bold text-center mb-8">
            Built for Agency Workflows
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <h4 className="font-semibold mb-2">{feature.title}</h4>
                  <p className="text-sm text-foreground/70">
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Use Cases */}
        <section className="gsap-section max-w-4xl mx-auto pb-16">
          <h3 className="text-2xl font-bold text-center mb-8">
            How Agencies Use Genfeed
          </h3>
          <div className="space-y-4">
            {USE_CASES.map((useCase) => (
              <Card key={useCase.title} className="overflow-hidden p-0">
                <div className="flex flex-col md:flex-row">
                  <div className="relative w-full md:w-48 h-40 md:h-auto flex-shrink-0">
                    <Image
                      src={useCase.imageUrl}
                      alt={useCase.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 192px"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-6">
                    <h4 className="font-semibold mb-2">{useCase.title}</h4>
                    <p className="text-foreground/70">{useCase.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Enterprise CTA */}
        <section className="max-w-4xl mx-auto pb-16">
          <Card className="text-center bg-background/50">
            <h3 className="text-2xl font-bold mb-2">Ready to Scale?</h3>
            <p className="text-foreground/70 mb-6 max-w-lg mx-auto">
              Get a custom demo for your agency. We&apos;ll show you how to
              onboard your first 5 clients in a week.
            </p>
            <PricingStrip className="mb-6" />
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="mailto:sales@genfeed.ai"
                className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2 font-medium transition-colors"
              >
                Talk to Sales
                <HiArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center border border-input hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 gap-2 font-medium transition-colors"
              >
                View Pricing
              </Link>
            </div>
          </Card>
        </section>
      </PageLayout>
    </div>
  );
}

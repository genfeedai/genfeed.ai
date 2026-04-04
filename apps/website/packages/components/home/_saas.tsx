'use client';

import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { SectionHeader } from '@ui/sections/header';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import {
  HiArrowRight,
  HiBolt,
  HiCloud,
  HiShieldCheck,
  HiUserGroup,
} from 'react-icons/hi2';

const SAAS_FEATURES = [
  {
    description:
      'No servers to maintain. We handle infrastructure, updates, and scaling.',
    icon: HiCloud,
    title: 'Fully Managed',
  },
  {
    description:
      'Start creating content in minutes. No Docker, no configuration.',
    icon: HiBolt,
    title: 'Instant Setup',
  },
  {
    description: 'SOC 2 compliant. Your data stays encrypted and private.',
    icon: HiShieldCheck,
    title: 'Enterprise Security',
  },
  {
    description:
      'Built for agencies and teams. Roles, permissions, and shared workflows.',
    icon: HiUserGroup,
    title: 'Team Collaboration',
  },
];

const CORE_FEATURES = [
  'Self-hosted, full control',
  'Bring your own API keys',
  'MIT licensed, forever free',
  'Community support',
];

const CLOUD_FEATURES = [
  'Everything in Core, plus:',
  'Managed infrastructure',
  'Team collaboration tools',
  'Priority support & SLA',
];

interface ComparisonSectionProps {
  typeLabel: string;
  productName: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  ctaExternal?: boolean;
  isPrimary?: boolean;
}

function ComparisonSection({
  typeLabel,
  productName,
  features,
  ctaLabel,
  ctaHref,
  ctaExternal,
  isPrimary = false,
}: ComparisonSectionProps): React.ReactElement {
  const cardClasses = isPrimary ? 'border-primary/30' : '';
  const labelClasses = isPrimary ? 'text-primary' : 'text-foreground/60';
  const checkColor = isPrimary ? 'text-primary' : 'text-green-400';

  const linkContent = (
    <>
      {ctaLabel}
      <HiArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </>
  );

  return (
    <Card
      variant={isPrimary ? CardVariant.WHITE : CardVariant.DEFAULT}
      className={cardClasses}
      bodyClassName="p-8"
    >
      <div
        className={cn(
          'text-sm font-semibold uppercase tracking-wide mb-2',
          labelClasses,
        )}
      >
        {typeLabel}
      </div>

      <Heading size="lg" className="text-2xl font-bold mb-4">
        {productName}
      </Heading>

      <ul className="space-y-3 text-foreground/70 mb-6">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2">
            <span className={checkColor}>&#10003;</span>
            {feature}
          </li>
        ))}
      </ul>

      {isPrimary ? (
        <Button asChild size={ButtonSize.LG} variant={ButtonVariant.BLACK}>
          <Link href={ctaHref}>{linkContent}</Link>
        </Button>
      ) : ctaExternal ? (
        <a
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-primary hover:underline group"
        >
          {linkContent}
        </a>
      ) : (
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 text-primary hover:underline group"
        >
          {linkContent}
        </Link>
      )}
    </Card>
  );
}

export default function HomeSaaS() {
  return (
    <section
      id="saas"
      className="gen-section-spacing bg-gradient-to-b from-background to-primary/5"
    >
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            title={
              <>
                Cloud for <span className="font-light">Teams.</span>
              </>
            }
            description="All the power of the open source platform, without the DevOps. Perfect for agencies, brands, and content teams."
          />

          {/* Features grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {SAAS_FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  variant={CardVariant.DEFAULT}
                  className="hover:-translate-y-1 hover:border-primary/30 transition-transform"
                  bodyClassName="p-6"
                >
                  <div className="w-12 h-12 bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <Heading size="lg" className="text-lg font-semibold mb-2">
                    {feature.title}
                  </Heading>
                  <Text as="p" className="text-sm text-foreground/60">
                    {feature.description}
                  </Text>
                </Card>
              );
            })}
          </div>

          {/* Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ComparisonSection
              typeLabel="Open Source"
              productName="Genfeed Core"
              features={CORE_FEATURES}
              ctaLabel="Get Started"
              ctaHref={EnvironmentService.github.core}
              ctaExternal
            />

            <ComparisonSection
              typeLabel="Managed Cloud"
              productName="Genfeed Cloud"
              features={CLOUD_FEATURES}
              ctaLabel="Get Started"
              ctaHref={`${EnvironmentService.apps.app}/sign-up`}
              isPrimary
            />
          </div>
        </div>
      </div>
    </section>
  );
}

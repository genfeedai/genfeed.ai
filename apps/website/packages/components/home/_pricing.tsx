'use client';

import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import {
  contentServiceOffering,
  getEnterprisePlan,
  websitePlans,
} from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import Card from '@ui/card/Card';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { HiCurrencyDollar } from 'react-icons/hi2';
import { LuArrowRight, LuCheck } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const FEATURED_TIER = 'Scale';

// Show only cloud plans on homepage (Pro, Scale, Enterprise — skip Self-Hosted)
const homePlans = websitePlans.filter((p) => p.type !== 'byok');

function formatPrice(price: number | null): string {
  if (price === null) return 'Custom';
  if (price === 0) return 'Free';
  return `$${price.toLocaleString()}`;
}

export default function HomePricing(): React.ReactElement {
  const isPreLaunch = EnvironmentService.isPreLaunch;

  return (
    <section id="pricing" className="gen-section-spacing-lg">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <HStack className="items-center gap-3 mb-3">
          <HiCurrencyDollar className="h-4 w-4 gen-icon" />
          <Text className="gen-label gen-text-accent">Pricing</Text>
        </HStack>
        <Heading
          as="h2"
          className="text-4xl sm:text-5xl font-serif tracking-tighter mb-4"
        >
          Simple pricing that{' '}
          <span className="font-light italic gen-text-heading">scales.</span>
        </Heading>
        {isPreLaunch && (
          <Text className="gen-text-muted text-sm mb-12">
            Private beta — limited availability
          </Text>
        )}
        {!isPreLaunch && <div className="mb-8" />}

        {isPreLaunch ? <PreLaunchPricingStrip /> : <SaaSPricingStrip />}

        {/* Full pricing CTA */}
        <div className="mt-10 text-center">
          <ButtonTracked
            asChild
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.PUBLIC}
            trackingName="pricing_view_full_click"
          >
            <Link href="/pricing">
              View Full Pricing
              <LuArrowRight className="h-3 w-3" />
            </Link>
          </ButtonTracked>
        </div>
      </div>
    </section>
  );
}

function PreLaunchPricingStrip() {
  const enterprise = getEnterprisePlan();
  const dfy = contentServiceOffering;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
      {/* Studio tier */}
      <Card
        variant={CardVariant.DEFAULT}
        className="!rounded-none bg-fill/[0.02] gen-border hover:border-[var(--gen-accent-hover)] transition-all"
        bodyClassName="gap-0 p-6"
      >
        <VStack className="gap-5 h-full">
          <VStack className="gap-2">
            <Text className="text-xs font-bold uppercase tracking-widest gen-text-muted">
              Studio
            </Text>
            <Heading as="h3" className="text-3xl font-black text-surface">
              $9,999
            </Heading>
            <Text className="text-xs text-surface/50">/month</Text>
          </VStack>

          <Text className="text-sm font-semibold text-surface/70">
            Unlimited everything
          </Text>

          <div className="gen-divider-accent" />

          <ul className="space-y-2 flex-1">
            {enterprise.features.slice(0, 4).map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <LuCheck className="h-3 w-3 mt-0.5 shrink-0 text-surface/40" />
                <Text className="text-xs text-surface/50">{feature}</Text>
              </li>
            ))}
          </ul>

          <ButtonTracked
            asChild
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.PUBLIC}
            className="w-full justify-center"
            trackingName="pricing_plan_click"
            trackingData={{ plan: 'studio' }}
          >
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
              Book a Demo
              <LuArrowRight className="h-3 w-3" />
            </a>
          </ButtonTracked>
        </VStack>
      </Card>

      {/* DFY card */}
      <Card
        variant={CardVariant.WHITE}
        className="!rounded-none gen-card-featured shadow-[var(--shadow-glow-md)] transition-all"
        bodyClassName="gap-0 p-6"
      >
        <VStack className="gap-5 h-full">
          <VStack className="gap-2">
            <Text className="text-xs font-bold uppercase tracking-widest text-inv-fg/60">
              Done-For-You
            </Text>
            <Heading as="h3" className="text-3xl font-black text-inv-fg">
              From $2,500
            </Heading>
            <Text className="text-xs text-inv-fg/70">/month</Text>
          </VStack>

          <Text className="text-sm font-semibold text-inv-fg/80">
            Full-service content
          </Text>

          <div
            className="gen-divider-accent"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(0,0,0,0.2), transparent)',
            }}
          />

          <ul className="space-y-2 flex-1">
            {dfy.includes.slice(0, 4).map((item) => (
              <li key={item} className="flex items-start gap-2">
                <LuCheck className="h-3 w-3 mt-0.5 shrink-0 text-inv-fg/30" />
                <Text className="text-xs text-inv-fg/60">{item}</Text>
              </li>
            ))}
          </ul>

          <ButtonTracked
            asChild
            variant={ButtonVariant.BLACK}
            size={ButtonSize.PUBLIC}
            className="w-full justify-center"
            trackingName="pricing_plan_click"
            trackingData={{ plan: 'dfy' }}
          >
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
              Book a Call
              <LuArrowRight className="h-3 w-3" />
            </a>
          </ButtonTracked>
        </VStack>
      </Card>
    </div>
  );
}

function SaaSPricingStrip() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
      {homePlans.map((plan) => {
        const featured = plan.label === FEATURED_TIER;
        const isEnterprise = plan.type === 'enterprise';

        return (
          <Card
            key={plan.label}
            variant={featured ? CardVariant.WHITE : CardVariant.DEFAULT}
            className={cn(
              '!rounded-none transition-all',
              featured
                ? 'gen-card-featured shadow-[var(--shadow-glow-md)]'
                : 'bg-fill/[0.02] gen-border hover:border-[var(--gen-accent-hover)]',
            )}
            bodyClassName="gap-0 p-6"
          >
            <VStack className="gap-5 h-full">
              <VStack className="gap-2">
                <Text
                  className={cn(
                    'text-xs font-bold uppercase tracking-widest',
                    featured ? 'text-inv-fg/60' : 'gen-text-muted',
                  )}
                >
                  {plan.label}
                </Text>
                <Heading
                  as="h3"
                  className={cn(
                    'text-3xl font-black',
                    featured ? 'text-inv-fg' : 'text-surface',
                  )}
                >
                  {formatPrice(isEnterprise ? null : plan.price)}
                </Heading>
                <Text
                  className={cn(
                    'text-xs',
                    featured ? 'text-inv-fg/70' : 'text-surface/50',
                  )}
                >
                  {isEnterprise ? 'Custom pricing' : '/month'}
                </Text>
              </VStack>

              {plan.outputs ? (
                <div className="space-y-1">
                  <Text
                    className={cn(
                      'text-sm font-semibold',
                      featured ? 'text-inv-fg/80' : 'text-surface/70',
                    )}
                  >
                    {plan.outputs.images?.toLocaleString()} images
                  </Text>
                  <Text
                    className={cn(
                      'text-xs',
                      featured ? 'text-inv-fg/50' : 'text-surface/40',
                    )}
                  >
                    {plan.outputs.videoMinutes} min video ·{' '}
                    {plan.outputs.voiceMinutes} min voice
                  </Text>
                </div>
              ) : (
                <Text
                  className={cn(
                    'text-sm font-semibold',
                    featured ? 'text-inv-fg/80' : 'text-surface/70',
                  )}
                >
                  Unlimited everything
                </Text>
              )}

              <div
                className="gen-divider-accent"
                style={
                  featured
                    ? {
                        background:
                          'linear-gradient(to right, transparent, rgba(0,0,0,0.2), transparent)',
                      }
                    : undefined
                }
              />

              <ul className="space-y-2 flex-1">
                {plan.features.slice(0, 4).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <LuCheck
                      className={cn(
                        'h-3 w-3 mt-0.5 shrink-0',
                        featured ? 'text-inv-fg/30' : 'text-surface/40',
                      )}
                    />
                    <Text
                      className={cn(
                        'text-xs',
                        featured ? 'text-inv-fg/60' : 'text-surface/50',
                      )}
                    >
                      {feature}
                    </Text>
                  </li>
                ))}
              </ul>

              <ButtonTracked
                asChild
                variant={featured ? ButtonVariant.BLACK : ButtonVariant.OUTLINE}
                size={ButtonSize.PUBLIC}
                className="w-full justify-center"
                trackingName="pricing_plan_click"
                trackingData={{ plan: plan.label.toLowerCase() }}
              >
                {isEnterprise ? (
                  <a
                    href={CALENDLY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Book a Demo
                    <LuArrowRight className="h-3 w-3" />
                  </a>
                ) : (
                  <Link href="/pricing">
                    Get Started
                    <LuArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </ButtonTracked>
            </VStack>
          </Card>
        );
      })}
    </div>
  );
}

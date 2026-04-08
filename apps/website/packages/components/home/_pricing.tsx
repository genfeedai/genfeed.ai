'use client';

import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import { websitePlans } from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
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
          className="text-4xl sm:text-5xl font-serif tracking-tighter mb-12"
        >
          Simple pricing that{' '}
          <span className="font-light italic gen-text-heading">scales.</span>
        </Heading>

        {/* Subscription plan grid */}
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

                  {/* Output quotas */}
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

                  {/* Key features */}
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
                    variant={
                      featured ? ButtonVariant.BLACK : ButtonVariant.OUTLINE
                    }
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

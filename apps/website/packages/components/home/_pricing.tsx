'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  CreditPackTier,
  creditPackPrice,
  creditPackTotalCredits,
  WEBSITE_CREDIT_PACKS,
} from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { HiCurrencyDollar } from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const FEATURED_TIER = 'Pro';

interface SecondaryItem {
  label: string;
  price: string;
  href: string;
  external?: boolean;
}

const SECONDARY_ITEMS: SecondaryItem[] = [
  { href: '/pricing', label: 'BYOK', price: 'Free' },
  {
    external: true,
    href: CALENDLY_URL,
    label: 'Done-For-You',
    price: 'From $2,500/mo',
  },
  { href: '/pricing', label: 'Training', price: 'From $299' },
];

function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

function formatCredits(value: number): string {
  return value.toLocaleString();
}

function perCreditCost(pack: CreditPackTier): string {
  const price = creditPackPrice(pack);
  const total = creditPackTotalCredits(pack);
  return `$${(price / total).toFixed(4)}`;
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
          Flexible pricing for{' '}
          <span className="font-light italic gen-text-heading">
            agency operations.
          </span>
        </Heading>

        {/* Credit pack grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
          {WEBSITE_CREDIT_PACKS.map((pack) => {
            const featured = pack.label === FEATURED_TIER;
            const price = creditPackPrice(pack);
            const totalCredits = creditPackTotalCredits(pack);

            return (
              <div
                key={pack.label}
                className={cn(
                  'rounded-2xl p-6 border transition-all',
                  featured
                    ? 'gen-card-featured shadow-[var(--shadow-glow-md)]'
                    : 'bg-fill/[0.02] gen-border hover:border-[var(--gen-accent-hover)]',
                )}
              >
                <VStack className="gap-5 h-full">
                  <VStack className="gap-2">
                    <Text
                      className={cn(
                        'text-xs font-bold uppercase tracking-widest',
                        featured ? 'text-inv-fg/60' : 'gen-text-muted',
                      )}
                    >
                      {pack.label}
                    </Text>
                    <Heading
                      as="h3"
                      className={cn(
                        'text-3xl font-black',
                        featured ? 'text-inv-fg' : 'text-surface',
                      )}
                    >
                      {formatCurrency(price)}
                    </Heading>
                    <Text
                      className={cn(
                        'text-xs',
                        featured ? 'text-inv-fg/70' : 'text-surface/50',
                      )}
                    >
                      {formatCredits(totalCredits)} credits
                    </Text>
                  </VStack>

                  {pack.bonus ? (
                    <span
                      className={cn(
                        'inline-flex self-start rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        featured
                          ? 'bg-inv-fg/15 text-inv-fg'
                          : 'bg-fill/[0.06] gen-text-accent',
                      )}
                    >
                      +{formatCredits(pack.bonus)} bonus
                    </span>
                  ) : null}

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

                  <Text
                    className={cn(
                      'text-[10px] tabular-nums',
                      featured ? 'text-inv-fg/40' : 'text-surface/30',
                    )}
                  >
                    {perCreditCost(pack)} per credit
                  </Text>

                  <div className="flex-1" />

                  <ButtonTracked
                    asChild
                    variant={
                      featured ? ButtonVariant.BLACK : ButtonVariant.OUTLINE
                    }
                    size={ButtonSize.PUBLIC}
                    className="w-full justify-center"
                    trackingName="pricing_credit_pack_click"
                    trackingData={{ pack: pack.label.toLowerCase() }}
                  >
                    <Link href="/pricing">
                      Buy Credits
                      <LuArrowRight className="h-3 w-3" />
                    </Link>
                  </ButtonTracked>
                </VStack>
              </div>
            );
          })}
        </div>

        {/* Secondary offerings */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mt-1.5">
          {SECONDARY_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between rounded-2xl border bg-fill/[0.02] p-4 gen-border transition-all hover:border-[var(--gen-accent-hover)]"
              {...(item.external
                ? { rel: 'noopener noreferrer', target: '_blank' }
                : {})}
            >
              <Text className="text-xs font-bold uppercase tracking-widest gen-text-muted">
                {item.label}
              </Text>
              <Text className="text-sm font-semibold text-surface">
                {item.price}
              </Text>
            </Link>
          ))}
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

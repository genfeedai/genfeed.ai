'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  contentServiceOffering,
  creditPackPrice,
  creditPackTotalCredits,
  creditsToOutputEstimate,
  WEBSITE_CREDIT_PACKS,
} from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import AppLink from '@ui/navigation/link/Link';
import { Button } from '@ui/primitives/button';
import FaqGrid from '@web-components/content/FaqGrid';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { LuCheck, LuSparkles } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

// Tier numbering and short labels for the Neural Noir aesthetic
const tierMeta: Record<string, { number: string; shortLabel: string }> = {
  Pro: { number: '02', shortLabel: 'Agency' },
  Scale: { number: '03', shortLabel: 'Scale' },
  Starter: { number: '01', shortLabel: 'Starter' },
};

interface SecondaryItem {
  label: string;
  price: string;
  href: string;
  external?: boolean;
}

const SECONDARY_ITEMS: SecondaryItem[] = [
  { href: '/sign-up', label: 'BYOK', price: 'Free' },
  {
    external: true,
    href: CALENDLY_URL,
    label: 'Enterprise',
    price: 'Book a Call',
  },
  {
    external: true,
    href: CALENDLY_URL,
    label: 'Done-For-You',
    price: 'From $2,500/mo',
  },
  {
    external: true,
    href: CALENDLY_URL,
    label: 'Dedicated Server',
    price: 'Custom',
  },
  { external: true, href: CALENDLY_URL, label: 'Training', price: 'From $299' },
];

export default function PricingContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Pricing"
        badgeIcon={LuSparkles}
        title={
          <>
            Choose how you <span className="italic font-light">create.</span>
          </>
        }
        description="Use our platform yourself, let us create for you, or get help getting started."
      >
        {/* ── Credit Packs Grid ── */}
        <WebSection maxWidth="full">
          <SectionHeader
            title="Credit Packs"
            description="No subscription. No commitment. Buy credits, use them whenever you need."
            className="[&_h2]:text-5xl mb-4"
          />
          <NeuralGrid columns={3}>
            {WEBSITE_CREDIT_PACKS.map((pack) => {
              const meta = tierMeta[pack.label];
              const price = creditPackPrice(pack);
              const totalCredits = creditPackTotalCredits(pack);
              const estimates = creditsToOutputEstimate(totalCredits);
              const isPopular = pack.label === 'Pro';

              return (
                <NeuralGridItem
                  key={pack.label}
                  padding="lg"
                  inverted={isPopular}
                  className="relative gsap-card"
                  style={isPopular ? undefined : { backgroundColor: '#18181b' }}
                >
                  {isPopular && (
                    <div className="absolute top-6 right-6">
                      <span className="px-3 py-1 bg-black text-surface text-[10px] font-black uppercase tracking-widest rounded-full">
                        Best Value
                      </span>
                    </div>
                  )}

                  <div
                    className={cn(
                      'text-xs font-black uppercase tracking-widest mb-6',
                      isPopular ? 'text-inv-fg/30' : 'text-surface/20',
                    )}
                  >
                    {meta.number} / {meta.shortLabel}
                  </div>

                  <div className="mb-2">
                    <span
                      className={cn(
                        'text-5xl font-serif',
                        isPopular && 'text-inv-fg',
                      )}
                    >
                      ${price.toLocaleString()}
                    </span>
                  </div>

                  <div
                    className={cn(
                      'text-sm mb-8',
                      isPopular ? 'text-inv-fg/50' : 'text-surface/40',
                    )}
                  >
                    {pack.credits.toLocaleString()} credits
                    {pack.bonus && (
                      <span
                        className={cn(
                          'ml-2 px-2 py-0.5 text-[10px] font-black uppercase rounded-full',
                          isPopular
                            ? 'bg-inv-fg/10 text-inv-fg/60'
                            : 'bg-fill/10 text-surface/60',
                        )}
                      >
                        +{pack.bonus.toLocaleString()} bonus
                      </span>
                    )}
                  </div>

                  <div
                    className={cn(
                      'py-6 border-y mb-8',
                      isPopular ? 'border-inv-fg/10' : 'border-edge/5',
                    )}
                  >
                    <div
                      className={cn(
                        'text-2xl font-bold',
                        isPopular && 'text-inv-fg',
                      )}
                    >
                      ~{estimates.images.toLocaleString()} images
                    </div>
                    <div
                      className={cn(
                        'text-sm mt-1',
                        isPopular ? 'text-inv-fg/40' : 'text-surface/40',
                      )}
                    >
                      ~{estimates.videoMinutes} min video
                    </div>
                    <div
                      className={cn(
                        'text-sm mt-0.5',
                        isPopular ? 'text-inv-fg/40' : 'text-surface/40',
                      )}
                    >
                      ~{estimates.voiceMinutes.toLocaleString()} min voice
                    </div>
                  </div>

                  <ul className="space-y-4 mb-auto">
                    {[
                      'Premium AI models included',
                      'No subscription needed',
                      'Credits never expire',
                      'Email support',
                    ].map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <LuCheck
                          className={cn(
                            'h-4 w-4 mt-0.5 shrink-0',
                            isPopular ? 'text-inv-fg/30' : 'text-surface/40',
                          )}
                        />
                        <span
                          className={cn(
                            'text-sm',
                            isPopular ? 'text-inv-fg/60' : 'text-surface/60',
                          )}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <AppLink
                    url={`${EnvironmentService.apps.app}/sign-up?credits=${pack.credits}`}
                    label="Buy Credits"
                    variant={
                      isPopular ? ButtonVariant.BLACK : ButtonVariant.DEFAULT
                    }
                    size={ButtonSize.PUBLIC}
                    className="mt-12 text-center"
                  />
                </NeuralGridItem>
              );
            })}
          </NeuralGrid>

          {/* ── Secondary Offerings ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 mt-1.5">
            {SECONDARY_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between p-4 border border-edge/10 bg-fill/[0.02] hover:border-surface/20 transition-all"
                {...(item.external
                  ? { rel: 'noopener noreferrer', target: '_blank' }
                  : {})}
              >
                <span className="text-xs font-black uppercase tracking-widest text-surface/40">
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-surface">
                  {item.price}
                </span>
              </Link>
            ))}
          </div>
        </WebSection>

        {/* FAQ */}
        <WebSection bg="bordered" maxWidth="md" className="gsap-section">
          <SectionHeader
            title="Common Questions"
            description="Everything you need to know about pricing, services, and training."
            className="[&_h2]:text-5xl"
          />

          <FaqGrid
            items={[
              {
                answer:
                  'Bring Your Own Key. You provide API keys from AI providers (OpenAI, Anthropic, Replicate, etc.) and use Genfeed completely free. You pay providers directly — we handle the orchestration.',
                question: "What's BYOK?",
              },
              {
                answer:
                  'No. Credit packs are one-time purchases with no expiration. Buy credits when you need them, use them whenever you want.',
                question: 'Do I need a subscription?',
              },
              {
                answer:
                  'Yes — you can have both BYOK keys and credit packs. Use your own keys for free, or spend credits when you want us to handle the AI models.',
                question: 'Can I use BYOK and credits together?',
              },
              {
                answer:
                  'We auto-select premium models (GPT-4, Claude, Runway, ElevenLabs) for best quality when using credits. With BYOK, you use whichever models your API keys support.',
                question: 'What AI models do you use?',
              },
              {
                answer:
                  'We set up dedicated infrastructure running open-source AI models (Llama, Mistral, Stable Diffusion, etc.). You get unlimited generation with pricing based on server costs.',
                question: "What's included in the Dedicated Server option?",
              },
              {
                answer:
                  'With the Done-For-You service, you get a dedicated content strategist who handles everything — from content calendar to production to publishing. You just review and approve. It starts at $2,500/month.',
                question: 'How does the Done-For-You service work?',
              },
              {
                answer:
                  'Setup packages are one-time. Quick Start gets you running in an hour. Full Onboarding covers your entire team and includes 30 days of support. Training Sessions are custom workshops for advanced use cases.',
                question: 'What are the training packages?',
              },
              {
                answer:
                  "Absolutely. Many clients start with a training package to learn the platform, then add Done-For-You for content they don't have time to produce themselves.",
                question: 'Can I combine services with platform access?',
              },
            ]}
          />

          <div className="text-center mt-12">
            <Link
              href="/faq"
              className="text-[10px] font-black uppercase tracking-widest text-surface/40 hover:text-surface transition-colors"
            >
              View All FAQs →
            </Link>
          </div>
        </WebSection>

        {/* CTA Section */}
        <CtaSection
          bg="subtle"
          title="Ready to Create?"
          description="Use the platform yourself, let us handle everything, or get started with a training session."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a
              href={`${EnvironmentService.apps.app}/sign-up`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Start Free with BYOK
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <Link href={contentServiceOffering.ctaHref} target="_blank">
              Book a Call
            </Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}

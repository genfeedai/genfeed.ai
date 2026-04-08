'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  formatOutputs,
  formatPrice,
  websitePlans,
} from '@helpers/business/pricing/pricing.helper';
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
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import { LuCheck, LuSparkles } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

// Tier numbering and short labels for the Neural Noir aesthetic
const tierMeta: Record<string, { number: string; shortLabel: string }> = {
  Enterprise: { number: '03', shortLabel: 'Studio' },
  Pro: { number: '01', shortLabel: 'Agency' },
  Scale: { number: '02', shortLabel: 'Scale' },
  'Self-Hosted': { number: '00', shortLabel: 'Deploy' },
};

const FEATURED_TIER = 'Scale';

export default function PricingContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Pricing"
        badgeIcon={LuSparkles}
        title={
          <>
            Simple pricing that{' '}
            <span className="italic font-light">scales.</span>
          </>
        }
        description="Self-host for free or choose a managed cloud plan. No hidden fees."
      >
        {/* ── Subscription Plans Grid ── */}
        <WebSection maxWidth="full">
          <SectionHeader
            title="Plans"
            description="Output-based pricing. Pay for what you create — videos, images, and voice minutes."
            className="[&_h2]:text-5xl mb-4"
          />
          <NeuralGrid columns={4}>
            {websitePlans.map((plan) => {
              const meta = tierMeta[plan.label];
              const isPopular = plan.label === FEATURED_TIER;
              const isSelfHosted = plan.type === 'byok';
              const isEnterprise = plan.type === 'enterprise';
              const priceDisplay = isEnterprise
                ? 'Custom'
                : formatPrice(plan.price);
              const outputDisplay = formatOutputs(plan.outputs ?? undefined);

              // Determine CTA href
              const ctaHref = isSelfHosted
                ? '/host'
                : isEnterprise
                  ? CALENDLY_URL
                  : plan.ctaHref || `${EnvironmentService.apps.app}/sign-up`;

              const ctaLabel = plan.cta || 'Get Started';
              const ctaExternal =
                isEnterprise || (!isSelfHosted && !isEnterprise);

              return (
                <NeuralGridItem
                  key={plan.label}
                  padding="lg"
                  inverted={isPopular}
                  className="relative gsap-card !rounded-none"
                  style={
                    isPopular
                      ? { borderRadius: 0 }
                      : { backgroundColor: '#18181b', borderRadius: 0 }
                  }
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
                    {meta?.number} / {meta?.shortLabel}
                  </div>

                  <div className="mb-2">
                    <span
                      className={cn(
                        'text-5xl font-serif',
                        isPopular && 'text-inv-fg',
                      )}
                    >
                      {priceDisplay}
                    </span>
                    {plan.price && !isEnterprise ? (
                      <span
                        className={cn(
                          'text-sm ml-1',
                          isPopular ? 'text-inv-fg/40' : 'text-surface/40',
                        )}
                      >
                        /mo
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={cn(
                      'text-sm mb-8',
                      isPopular ? 'text-inv-fg/50' : 'text-surface/40',
                    )}
                  >
                    {plan.description}
                  </div>

                  {/* Output quotas */}
                  {outputDisplay ? (
                    <div
                      className={cn(
                        'py-6 border-y mb-8',
                        isPopular ? 'border-inv-fg/10' : 'border-edge/5',
                      )}
                    >
                      {plan.outputs?.videoMinutes ? (
                        <div
                          className={cn(
                            'text-2xl font-bold',
                            isPopular && 'text-inv-fg',
                          )}
                        >
                          {plan.outputs.videoMinutes} min video
                        </div>
                      ) : null}
                      {plan.outputs?.images ? (
                        <div
                          className={cn(
                            'text-sm mt-1',
                            isPopular ? 'text-inv-fg/40' : 'text-surface/40',
                          )}
                        >
                          {plan.outputs.images.toLocaleString()} images
                        </div>
                      ) : null}
                      {plan.outputs?.voiceMinutes ? (
                        <div
                          className={cn(
                            'text-sm mt-0.5',
                            isPopular ? 'text-inv-fg/40' : 'text-surface/40',
                          )}
                        >
                          {plan.outputs.voiceMinutes.toLocaleString()} min voice
                        </div>
                      ) : null}
                    </div>
                  ) : isEnterprise ? (
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
                        Unlimited
                      </div>
                      <div
                        className={cn(
                          'text-sm mt-1',
                          isPopular ? 'text-inv-fg/40' : 'text-surface/40',
                        )}
                      >
                        Videos, images, and voice
                      </div>
                    </div>
                  ) : (
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
                        Your keys
                      </div>
                      <div
                        className={cn(
                          'text-sm mt-1',
                          isPopular ? 'text-inv-fg/40' : 'text-surface/40',
                        )}
                      >
                        Your infrastructure
                      </div>
                    </div>
                  )}

                  <ul className="space-y-4 mb-auto">
                    {plan.features.map((feature) => (
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

                  <Button
                    asChild
                    variant={
                      isPopular ? ButtonVariant.BLACK : ButtonVariant.DEFAULT
                    }
                    size={ButtonSize.PUBLIC}
                    className="mt-12 w-full text-center"
                  >
                    {ctaExternal ? (
                      <a
                        href={ctaHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {ctaLabel}
                      </a>
                    ) : (
                      <Link href={ctaHref}>{ctaLabel}</Link>
                    )}
                  </Button>
                </NeuralGridItem>
              );
            })}
          </NeuralGrid>
        </WebSection>

        {/* FAQ */}
        <WebSection bg="bordered" maxWidth="md" className="gsap-section">
          <SectionHeader
            title="Common Questions"
            description="Everything you need to know about pricing and plans."
            className="[&_h2]:text-5xl"
          />

          <FaqGrid
            items={[
              {
                answer:
                  'Genfeed uses output-based pricing. You pay for what you create — videos, images, and voice minutes. Quotas reset monthly on your billing date.',
                question: 'How does pricing work?',
              },
              {
                answer:
                  'Yes — self-host the platform on your own infrastructure for free. You bring your own AI keys and manage the deployment. Cloud plans start at $499/mo with everything managed for you.',
                question: 'Is there a free option?',
              },
              {
                answer:
                  'Cloud plans include premium AI models that are auto-selected for best quality — GPT-4, Claude, Runway, ElevenLabs, and more. You never have to choose or configure models.',
                question: 'What AI models are included?',
              },
              {
                answer:
                  'When you reach your monthly quota, generation pauses until your next billing cycle. You can upgrade to a higher plan anytime for more capacity.',
                question: 'What happens when I hit my limit?',
              },
              {
                answer:
                  'Yes. All cloud plans are month-to-month with no lock-in. Cancel anytime from your account settings.',
                question: 'Can I cancel anytime?',
              },
              {
                answer:
                  'Unlimited video, images, and voice generation. Plus SSO, dedicated account manager, SLA, full API access, white-label branding, and custom domains.',
                question: "What's included in Enterprise?",
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
          title="Ready to Get Started?"
          description="Start creating content in minutes with a managed cloud plan, or deploy on your own infrastructure."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a
              href={`${EnvironmentService.apps.app}/sign-up`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Start Free Trial
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
              Book a Demo
            </a>
          </Button>
        </CtaSection>

        {/* Services link */}
        <div className="text-center pb-20">
          <Link
            href="/services"
            className="text-[10px] font-black uppercase tracking-widest text-surface/40 hover:text-surface transition-colors"
          >
            Looking for professional services? →
          </Link>
        </div>
      </PageLayout>
    </div>
  );
}

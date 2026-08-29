import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  creditPackPrice,
  creditPackTotalCredits,
  getProPlan,
  PLAN_COPY,
  WEBSITE_CREDIT_PACKS,
} from '@genfeedai/pricing';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

const CREDIT_EXPLAINERS = [
  'Credits buy output: images, reels, ads, articles, voice',
  `Subscriptions include monthly credits at a ${PLAN_COPY.pro.creditRateAdvantage} better rate`,
  'The router always picks the best model, so you never pay to experiment',
] as const;

export default function HomeCredits(): React.ReactElement {
  const proPlan = getProPlan();

  return (
    <section
      id="pricing"
      className="gen-section-spacing border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.55fr)] lg:items-end">
          <div className="flex flex-col gap-4">
            <Heading
              as="h2"
              className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
            >
              Pay for output, not access.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              Signing up is free. Credits buy the content you generate, and a
              subscription only exists to make those credits cheaper and support
              shared team seats.
            </Text>
          </div>

          <div className="gen-card-spotlight p-5">
            <div className="flex flex-col gap-4">
              {CREDIT_EXPLAINERS.map((item) => (
                <div className="flex flex-row items-start gap-3" key={item}>
                  <Check className="mt-0.5 size-4 shrink-0 text-surface/70" />
                  <Text className="text-sm leading-6 text-surface/60">
                    {item}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-3">
          {WEBSITE_CREDIT_PACKS.map((pack) => (
            <div
              key={pack.label}
              className="flex items-baseline justify-between gap-4 bg-background px-6 py-4"
            >
              <Text className="text-sm font-semibold text-surface">
                ${formatNumberWithCommas(creditPackPrice(pack))}
              </Text>
              <Text className="text-sm text-surface/60">
                {formatNumberWithCommas(creditPackTotalCredits(pack))} credits
              </Text>
            </div>
          ))}
        </div>

        {proPlan.launchNote ? (
          <Text className="mt-8 text-center text-xs font-medium text-surface/50">
            {proPlan.launchNote}
          </Text>
        ) : null}

        <div className="flex flex-row mt-4 flex-wrap items-center justify-center gap-4">
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingName="pricing_view_full_click"
            variant={ButtonVariant.SECONDARY}
          >
            <Link href="/pricing">
              Compare Plans
              <ArrowRight className="size-3" />
            </Link>
          </ButtonTracked>
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingData={{ action: 'book_demo_pricing' }}
            trackingName="pricing_demo_click"
            variant={ButtonVariant.SECONDARY}
          >
            <a
              href={EnvironmentService.calendly}
              rel="noopener noreferrer"
              target="_blank"
            >
              Book a Demo
            </a>
          </ButtonTracked>
        </div>
      </div>
    </section>
  );
}

'use client';

import { useAuth } from '@clerk/nextjs';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  creditPackPrice,
  creditPackTotalCredits,
  creditsToOutputEstimate,
  PAYG_CREDIT_PACKS,
  websitePlans,
} from '@genfeedai/helpers';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { StripeService } from '@services/billing/stripe.service';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HiArrowLeft, HiCheck, HiKey, HiSparkles } from 'react-icons/hi2';
import { toast } from 'sonner';

const byokPlan = websitePlans.find((p) => p.type === 'byok')!;

const TIMELINE_STEPS = [
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    selector: '.step-badge',
  },
  {
    duration: 1,
    from: { opacity: 0, y: 30 },
    offset: '-=0.4',
    selector: '.step-headline',
  },
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    offset: '-=0.5',
    selector: '.step-description',
  },
  {
    duration: 0.6,
    from: { opacity: 0, y: 30 },
    offset: '-=0.3',
    selector: '.plan-preview',
  },
  {
    duration: 0.6,
    from: { opacity: 0, y: 30 },
    offset: '-=0.3',
    selector: '.plan-card',
    stagger: 0.1,
  },
];

export default function PlanContent() {
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const { getToken } = useAuth();
  const router = useRouter();
  const [loadingPack, setLoadingPack] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(false);

  useEffect(() => {
    const preview = localStorage.getItem('gf_onboarding_preview_url');
    if (preview) {
      setPreviewUrl(preview);
    }
  }, []);

  const handleBuyCredits = async (credits: number) => {
    const paygPriceId = EnvironmentService.plans.payg;
    if (!paygPriceId) {
      toast.error('Credit purchases are not configured.');
      return;
    }

    setLoadingPack(credits);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        toast.error('Authentication expired. Please sign in again.');
        setLoadingPack(null);
        return;
      }

      const service = StripeService.getInstance(token);
      const result = await service.createCheckoutSession({
        cancelUrl: `${window.location.origin}/onboarding/plan`,
        quantity: credits,
        stripePriceId: paygPriceId,
        successUrl: `${window.location.origin}/onboarding/post-signup`,
      });

      if (result?.url) {
        window.location.href = result.url;
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
      setLoadingPack(null);
    }
  };

  const handleByokClick = useCallback(async () => {
    setLoadingSetup(true);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        toast.error('Authentication expired. Please sign in again.');
        setLoadingSetup(false);
        return;
      }

      const service = StripeService.getInstance(token);
      const result = await service.createSetupCheckout();

      if (result?.url) {
        window.location.href = result.url;
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
      setLoadingSetup(false);
    }
  }, [getToken]);

  const handleGoBack = () => {
    router.push('/onboarding/brand');
  };

  return (
    <div ref={sectionRef}>
      {/* Back */}
      <Button
        variant={ButtonVariant.GHOST}
        size={ButtonSize.SM}
        onClick={handleGoBack}
        icon={<HiArrowLeft className="h-4 w-4" />}
        className="text-white/40 hover:text-white/70 mb-8"
      >
        Back
      </Button>

      {/* Badge */}
      <div className="step-badge opacity-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-8">
        <HiSparkles className="h-3 w-3" />
        Step 2 of 2
      </div>

      {/* Headline */}
      <h1 className="step-headline opacity-0 text-4xl md:text-5xl font-serif leading-none tracking-tighter text-white mb-4">
        Your brand kit is <span className="font-light italic">ready.</span>
      </h1>

      <p className="step-description opacity-0 text-lg text-white/40 mb-12 max-w-lg">
        Start free with your own keys, or buy credits to use our premium AI
        models.
      </p>

      {/* Preview thumbnail */}
      {previewUrl && (
        <div className="plan-preview opacity-0 mb-10 flex justify-start">
          <img
            src={previewUrl}
            alt="Brand preview"
            className="w-52 h-52 rounded-lg object-cover border border-white/10"
          />
        </div>
      )}

      {/* BYOK Option */}
      <div className="plan-card opacity-0 mb-8">
        <div className="w-full max-w-5xl border border-white/20 bg-white/[0.04]">
          <Button
            variant={ButtonVariant.UNSTYLED}
            onClick={handleByokClick}
            isDisabled={loadingSetup}
            isLoading={loadingSetup}
            withWrapper={false}
            className="w-full p-8 text-left hover:bg-white/[0.02] transition-colors disabled:cursor-default"
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <HiKey className="h-5 w-5 text-white/40" />
                  <h3 className="text-lg font-semibold text-white">
                    BYOK — Bring Your Own Key
                  </h3>
                </div>
                <p className="text-sm text-white/50 mb-2">
                  {byokPlan.description}. Add your API keys in settings and
                  start creating immediately.
                </p>
                <p className="text-xs text-white/30 mb-4">
                  Card required. 5% platform fee after free tier (500
                  credits/month).
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {byokPlan.features.slice(0, 4).map((feature) => (
                    <span
                      key={feature}
                      className="flex items-center gap-2 text-xs text-white/40"
                    >
                      <HiCheck className="h-3 w-3 text-white/30" />
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-3xl font-bold text-white">Free</span>
                <div className="text-[10px] font-black uppercase tracking-wider text-white/30 mt-1">
                  {loadingSetup ? (
                    <span className="flex items-center justify-end gap-1">
                      <span className="w-3 h-3 border border-white/30 border-t-white/60 rounded-full animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    'Start free →'
                  )}
                </div>
              </div>
            </div>
          </Button>
        </div>
      </div>

      {/* Credit Pack Cards */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-3 lg:grid-cols-5 max-w-7xl">
        {PAYG_CREDIT_PACKS.map((pack) => {
          const price = creditPackPrice(pack);
          const totalCredits = creditPackTotalCredits(pack);
          const estimates = creditsToOutputEstimate(totalCredits);
          const isPro = pack.label === 'Pro';

          return (
            <div
              key={pack.label}
              className={`plan-card opacity-0 relative p-8 border flex flex-col ${
                isPro
                  ? 'border-white/20 bg-white/[0.04]'
                  : 'border-white/[0.08] bg-white/[0.02]'
              }`}
            >
              {/* Best Value badge */}
              {isPro && (
                <div className="absolute -top-3 left-8 px-3 py-0.5 bg-white text-black text-[10px] font-black uppercase tracking-wider">
                  Best Value
                </div>
              )}

              {/* Label */}
              <h3 className="text-lg font-semibold text-white mb-1">
                {pack.label}
              </h3>

              {/* Price */}
              <div className="mb-1">
                <span className="text-3xl font-bold text-white">
                  ${price.toLocaleString()}
                </span>
              </div>

              {/* Credits */}
              <p className="text-sm text-white/40 mb-4">
                {pack.credits.toLocaleString()} credits
                {pack.bonus && (
                  <span className="ml-2 text-emerald-400 font-medium">
                    +{pack.bonus.toLocaleString()} bonus
                  </span>
                )}
              </p>

              {/* Total credits when bonus exists */}
              {pack.bonus && (
                <p className="text-xs text-white/50 -mt-3 mb-4">
                  {totalCredits.toLocaleString()} total credits
                </p>
              )}

              {/* Output estimates */}
              <p className="text-xs text-white/30 uppercase tracking-wider mb-6">
                ~{estimates.images.toLocaleString()} images · ~
                {estimates.videoMinutes} min video · ~
                {estimates.voiceMinutes.toLocaleString()} min voice
              </p>

              {/* Features */}
              <ul className="space-y-2.5 mb-8 flex-1">
                {[
                  'Premium AI models included',
                  'No subscription',
                  'Credits never expire',
                ].map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-white/60"
                  >
                    <HiCheck className="h-4 w-4 text-white/30 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Button
                variant={isPro ? ButtonVariant.WHITE : ButtonVariant.SOFT}
                size={ButtonSize.LG}
                onClick={() => handleBuyCredits(pack.credits)}
                isDisabled={loadingPack !== null}
                isLoading={loadingPack === pack.credits}
                className="w-full"
              >
                {loadingPack === pack.credits ? 'Processing...' : 'Buy Credits'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

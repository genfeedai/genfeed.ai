'use client';

import { resolvePostSignupIntent } from '@app/(onboarding)/onboarding/post-signup/post-signup-routing.util';
import { useAuth, useUser } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { PERSONAL_EMAIL_DOMAINS } from '@genfeedai/constants';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { StripeService } from '@services/billing/stripe.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Button from '@ui/buttons/base/Button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isEEEnabled, isSelfHosted } from '@/lib/config/edition';
import { resolvePostSignupOnboardingHref } from './post-signup-onboarding-href.util';

export default function PostSignupPage() {
  const { getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const { currentUser, isLoading } = useCurrentUser();
  const calledRef = useRef(false);
  const [showFallback, setShowFallback] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Setting up your workspace...',
  );

  const resolveOnboardingHref = useCallback(
    async (prompt?: string): Promise<string> => {
      if (!isEEEnabled()) {
        return '/onboarding/brand';
      }

      if (isSelfHosted()) {
        return (
          resolvePostSignupOnboardingHref({
            isSelfHosted: true,
            prompt,
          }) ?? '/chat/onboarding'
        );
      }

      const token = await resolveClerkToken(getToken);
      if (!token) {
        return '/onboarding/brand';
      }

      const organizations = await OrganizationsService.getInstance(token)
        .getMyOrganizations()
        .catch((error) => {
          logger.error(
            'Failed to resolve organizations for post-signup routing',
            error,
          );
          return [];
        });

      return (
        resolvePostSignupOnboardingHref({
          isSelfHosted: false,
          organizations,
          prompt,
        }) ?? '/onboarding/brand'
      );
    },
    [getToken],
  );

  const resolveAutoBrandHref = useCallback(
    async (domain: string): Promise<string> => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('gf_brand_domain', domain);
      }

      const prompt = `My website is ${domain}. Help me set up my brand and generate my first onboarding image.`;
      const onboardingHref = await resolveOnboardingHref(prompt);

      if (onboardingHref === '/onboarding/brand') {
        return '/onboarding/brand?auto=true';
      }

      return onboardingHref;
    },
    [resolveOnboardingHref],
  );

  useEffect(() => {
    if (isLoading || !currentUser || !clerkUser || calledRef.current) {
      return;
    }

    calledRef.current = true;
    const fallbackTimeout = window.setTimeout(() => {
      setShowFallback(true);
    }, 12_000);

    const route = async () => {
      const selectedPlan = localStorage.getItem('gf_selected_plan');
      const selectedCredits = localStorage.getItem('gf_selected_credits');
      const primaryEmail =
        clerkUser.primaryEmailAddress?.emailAddress ||
        clerkUser.emailAddresses[0]?.emailAddress;
      const intent = resolvePostSignupIntent({
        personalEmailDomains: PERSONAL_EMAIL_DOMAINS,
        primaryEmail,
        selectedCredits,
        selectedPlan,
      });

      if (intent.kind === 'plan-checkout') {
        if (!isEEEnabled()) {
          window.location.href = '/onboarding/brand';
          return;
        }

        setStatusMessage('Preparing your plan checkout...');
        localStorage.removeItem('gf_selected_plan');

        try {
          const onboardingHref = await resolveOnboardingHref();
          const token = await resolveClerkToken(getToken);
          if (!token) {
            window.location.href = '/onboarding/providers';
            return;
          }

          const service = StripeService.getInstance(token);
          const result = await service.createCheckoutSession({
            cancelUrl: `${window.location.origin}/onboarding/providers`,
            quantity: null,
            stripePriceId: intent.stripePriceId,
            successUrl: `${window.location.origin}${onboardingHref}`,
          });

          if (result?.url) {
            window.location.href = result.url;
            return;
          }
        } catch (error) {
          logger.error(
            'Failed to create checkout session from post-signup',
            error,
          );
        }

        // Fallback: if checkout creation failed, go to plan page
        window.location.href = '/onboarding/providers';
        return;
      }

      if (intent.kind === 'credits-checkout') {
        if (!isEEEnabled()) {
          window.location.href = '/onboarding/brand';
          return;
        }

        setStatusMessage('Preparing your credits checkout...');
        localStorage.removeItem('gf_selected_credits');

        try {
          const onboardingHref = await resolveOnboardingHref();
          const token = await resolveClerkToken(getToken);
          if (!token) {
            window.location.href = '/onboarding/providers';
            return;
          }

          const paygPriceId = EnvironmentService.plans.payg;
          if (!paygPriceId) {
            window.location.href = '/onboarding/providers';
            return;
          }

          const service = StripeService.getInstance(token);
          const result = await service.createCheckoutSession({
            cancelUrl: `${window.location.origin}/onboarding/providers`,
            quantity: intent.credits,
            stripePriceId: paygPriceId,
            successUrl: `${window.location.origin}${onboardingHref}`,
          });

          if (result?.url) {
            window.location.href = result.url;
            return;
          }
        } catch (error) {
          logger.error(
            'Failed to create credits checkout from post-signup',
            error,
          );
        }

        window.location.href = '/onboarding/providers';
        return;
      }

      if (intent.kind === 'auto-brand') {
        setStatusMessage(
          'Detected your workspace domain. Continuing to brand setup...',
        );
        window.location.href = await resolveAutoBrandHref(intent.domain);
        return;
      }

      setStatusMessage('Continuing to onboarding...');
      window.location.href = await resolveOnboardingHref();
    };

    route().catch((error) => {
      logger.error('Post-signup routing failed unexpectedly', error);
      window.location.href = '/onboarding/brand';
    });

    return () => {
      window.clearTimeout(fallbackTimeout);
    };
  }, [
    isLoading,
    currentUser,
    clerkUser,
    getToken,
    resolveAutoBrandHref,
    resolveOnboardingHref,
  ]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
        <div
          aria-hidden="true"
          className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"
        />
        <output className="text-sm text-white/40" aria-live="polite">
          {statusMessage}
        </output>
        {showFallback && (
          <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-white/50 mb-3">
              This is taking longer than expected. You can continue manually.
            </p>
            <Button
              label="Continue to onboarding"
              onClick={() => {
                void resolveOnboardingHref().then((href) => {
                  window.location.href = href;
                });
              }}
              className="h-8 px-3 text-xs font-medium"
            />
          </div>
        )}
      </div>
    </div>
  );
}

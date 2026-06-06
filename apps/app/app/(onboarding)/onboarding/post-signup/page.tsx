'use client';

import {
  buildOnboardingResumeHref,
  parseSelectedCredits,
} from '@app/(onboarding)/onboarding/post-signup/post-signup-routing.util';
import { useAuth, useUser } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { getResumeStep, ONBOARDING_STEPS } from '@genfeedai/constants';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { ManagedCreditsService } from '@services/billing/managed-credits.service';
import { StripeService } from '@services/billing/stripe.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Button } from '@ui/primitives/button';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { isEEEnabled, isSelfHosted } from '@/lib/config/edition';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';

function PostSignupPageContent() {
  const { getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const { currentUser, isLoading } = useCurrentUser();
  const searchParams = useSearchParams();
  const requestedCreditsParam = searchParams.get('credits');
  const calledRef = useRef(false);
  const [showFallback, setShowFallback] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Setting up your workspace...',
  );
  const hasClerkUser = Boolean(clerkUser);
  const clerkPrimaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? '';
  const proactiveLeadId = clerkUser?.publicMetadata?.proactiveLeadId;
  const checkoutEmail = currentUser?.email || clerkPrimaryEmail || '';

  const resolveOnboardingHref = useCallback(async (): Promise<string> => {
    if (proactiveLeadId) {
      return '/onboarding/proactive';
    }

    const completedSteps = currentUser?.onboardingStepsCompleted ?? [];
    const hasCompletedAllOnboardingSteps = ONBOARDING_STEPS.every((step) =>
      completedSteps.includes(step),
    );

    if (hasCompletedAllOnboardingSteps) {
      return '/onboarding/summary';
    }

    const resumeStep = getResumeStep(completedSteps);
    const storedBrandDomain = localStorage.getItem(
      ONBOARDING_STORAGE_KEYS.brandDomain,
    );
    const onboardingHref = buildOnboardingResumeHref(
      resumeStep,
      storedBrandDomain,
    );

    if (!isEEEnabled() || isSelfHosted()) {
      return onboardingHref;
    }

    const token = await resolveClerkToken(getToken);
    if (!token) {
      return onboardingHref;
    }

    await OrganizationsService.getInstance(token)
      .getMyOrganizations()
      .catch((error) => {
        logger.error(
          'Failed to resolve organizations for post-signup routing',
          error,
        );
        return [];
      });

    return onboardingHref;
  }, [currentUser, getToken, proactiveLeadId]);

  useEffect(() => {
    if (isLoading || !currentUser || !hasClerkUser || calledRef.current) {
      return;
    }

    calledRef.current = true;
    const abortController = new AbortController();
    const { signal } = abortController;
    const fallbackTimeout = window.setTimeout(() => {
      if (!signal.aborted) {
        setShowFallback(true);
      }
    }, 12_000);

    const route = async () => {
      const redirectTo = (href: string) => {
        if (!signal.aborted) {
          window.location.href = href;
        }
      };

      const redirectToOnboarding = async () => {
        redirectTo(await resolveOnboardingHref());
      };

      const requestedCredits = parseSelectedCredits(requestedCreditsParam);
      if (requestedCredits) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedPlan);
        localStorage.setItem(
          ONBOARDING_STORAGE_KEYS.selectedCredits,
          requestedCredits.toString(),
        );
      }

      const selectedPlan = localStorage.getItem(
        ONBOARDING_STORAGE_KEYS.selectedPlan,
      );
      const selectedCredits = localStorage.getItem(
        ONBOARDING_STORAGE_KEYS.selectedCredits,
      );
      if (selectedPlan?.trim()) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedPlan);

        if (!isEEEnabled()) {
          await redirectToOnboarding();
          return;
        }

        if (!signal.aborted) {
          setStatusMessage('Preparing your plan checkout...');
        }

        try {
          const onboardingHref = await resolveOnboardingHref();
          const token = await resolveClerkToken(getToken);
          if (!token) {
            redirectTo('/onboarding/providers');
            return;
          }

          const service = StripeService.getInstance(token);
          const result = await service.createCheckoutSession({
            cancelUrl: `${window.location.origin}/onboarding/providers`,
            quantity: null,
            stripePriceId: selectedPlan,
            successUrl: `${window.location.origin}${onboardingHref}`,
          });

          if (result?.url) {
            redirectTo(result.url);
            return;
          }
        } catch (error) {
          if (signal.aborted) {
            return;
          }

          logger.error(
            'Failed to create checkout session from post-signup',
            error,
          );
        }

        // Fallback: if checkout creation failed, go to plan page
        redirectTo('/onboarding/providers');
        return;
      }

      const credits = parseSelectedCredits(selectedCredits);
      if (selectedCredits && !credits) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedCredits);
      }

      if (credits) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedCredits);

        if (isSelfHosted()) {
          if (!checkoutEmail) {
            await redirectToOnboarding();
            return;
          }

          if (!signal.aborted) {
            setStatusMessage('Preparing your managed credits checkout...');
          }

          try {
            const result = await ManagedCreditsService.createCheckoutSession(
              {
                cancelUrl: `${window.location.origin}/onboarding/providers`,
                email: checkoutEmail,
                firstName: currentUser?.firstName || undefined,
                lastName: currentUser?.lastName || undefined,
                quantity: credits,
                successUrl: `${window.location.origin}/managed-credits/success?session_id={CHECKOUT_SESSION_ID}`,
              },
              signal,
            );

            if (result?.url) {
              redirectTo(result.url);
              return;
            }
          } catch (error) {
            if (signal.aborted) {
              return;
            }

            logger.error(
              'Failed to create managed credits checkout from post-signup',
              error,
            );
          }

          await redirectToOnboarding();
          return;
        }

        if (!isEEEnabled()) {
          await redirectToOnboarding();
          return;
        }

        if (!signal.aborted) {
          setStatusMessage('Preparing your credits checkout...');
        }

        try {
          const onboardingHref = await resolveOnboardingHref();
          const token = await resolveClerkToken(getToken);
          if (!token) {
            redirectTo('/onboarding/providers');
            return;
          }

          const paygPriceId = EnvironmentService.plans.payg;
          if (!paygPriceId) {
            redirectTo('/onboarding/providers');
            return;
          }

          const service = StripeService.getInstance(token);
          const result = await service.createCheckoutSession({
            cancelUrl: `${window.location.origin}/onboarding/providers`,
            quantity: credits,
            stripePriceId: paygPriceId,
            successUrl: `${window.location.origin}${onboardingHref}`,
          });

          if (result?.url) {
            redirectTo(result.url);
            return;
          }
        } catch (error) {
          if (signal.aborted) {
            return;
          }

          logger.error(
            'Failed to create credits checkout from post-signup',
            error,
          );
        }

        redirectTo('/onboarding/providers');
        return;
      }

      if (!signal.aborted) {
        setStatusMessage('Continuing to onboarding...');
      }
      await redirectToOnboarding();
    };

    route().catch((error) => {
      if (signal.aborted) {
        return;
      }

      logger.error('Post-signup routing failed unexpectedly', error);
      window.location.href = '/onboarding/brand';
    });

    return () => {
      abortController.abort();
      window.clearTimeout(fallbackTimeout);
    };
  }, [
    checkoutEmail,
    currentUser,
    getToken,
    hasClerkUser,
    isLoading,
    requestedCreditsParam,
    resolveOnboardingHref,
  ]);

  return (
    <PageLoadingState
      className="bg-neutral-950"
      fullScreen={true}
      message={statusMessage}
    >
      {showFallback ? (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-3 text-xs text-white/50">
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
      ) : null}
    </PageLoadingState>
  );
}

export default function PostSignupPage() {
  return (
    <Suspense fallback={null}>
      <PostSignupPageContent />
    </Suspense>
  );
}

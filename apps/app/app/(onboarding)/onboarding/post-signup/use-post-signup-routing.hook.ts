'use client';

import {
  appendCheckoutReturnParams,
  buildOnboardingResumeHref,
  isFreePlanHandoff,
  parseSelectedCredits,
} from '@app/(onboarding)/onboarding/post-signup/post-signup-routing.util';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { getResumeStep, ONBOARDING_STEPS } from '@genfeedai/constants';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { ManagedCreditsService } from '@services/billing/managed-credits.service';
import { StripeService } from '@services/billing/stripe.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { isEEEnabled, isSelfHosted } from '@/lib/config/edition';
import {
  extractBrandDomain,
  ONBOARDING_STORAGE_KEYS,
  resolveSelectedPlanParam,
} from '@/lib/onboarding/onboarding-access.util';

export type PostSignupRoutingState = {
  showFallback: boolean;
  statusMessage: string;
  resolveOnboardingHref: () => Promise<string>;
};

export function usePostSignupRouting(): PostSignupRoutingState {
  const { getToken } = useAuthIdentity();
  const { user: authUser } = useAuthUser();
  const { currentUser, isLoading } = useCurrentUser();
  const searchParams = useSearchParams();
  const requestedPlanParam = searchParams.get('plan');
  const requestedCreditsParam = searchParams.get('credits');
  const requestedBrandDomainParam = searchParams.get('brandDomain');
  const requestedBrandNameParam = searchParams.get('brandName');
  const calledRef = useRef(false);
  const [showFallback, setShowFallback] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Setting up your workspace...',
  );
  const hasAuthUser = Boolean(authUser);
  const authPrimaryEmail = authUser?.primaryEmailAddress?.emailAddress ?? '';
  const proactiveLeadId = authUser?.publicMetadata?.proactiveLeadId;
  const checkoutEmail = currentUser?.email || authPrimaryEmail || '';

  const resolveOnboardingHref = useCallback(async (): Promise<string> => {
    if (proactiveLeadId) {
      return '/onboarding/proactive';
    }

    const completedSteps = currentUser?.onboardingStepsCompleted ?? [];
    const hasCompletedAllOnboardingSteps =
      currentUser?.isOnboardingCompleted === true ||
      ONBOARDING_STEPS.every((step) => completedSteps.includes(step));

    if (hasCompletedAllOnboardingSteps) {
      return '/';
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

    const token = await resolveAuthToken(getToken);
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
    if (isLoading || !currentUser || !hasAuthUser || calledRef.current) {
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

      const requestedBrandDomain = extractBrandDomain(
        requestedBrandDomainParam,
      );
      const requestedBrandName = requestedBrandNameParam?.trim();
      if (requestedBrandDomain) {
        localStorage.setItem(
          ONBOARDING_STORAGE_KEYS.brandDomain,
          requestedBrandDomain,
        );
      }
      if (requestedBrandName) {
        localStorage.setItem(
          ONBOARDING_STORAGE_KEYS.brandName,
          requestedBrandName,
        );
      }

      const requestedPlan = resolveSelectedPlanParam(requestedPlanParam);
      const requestedCredits = parseSelectedCredits(requestedCreditsParam);
      const hasRequestedPlan = requestedPlanParam !== null;
      const hasRequestedCredits = requestedCreditsParam !== null;

      if (hasRequestedPlan) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedCredits);
        if (requestedPlan) {
          localStorage.setItem(
            ONBOARDING_STORAGE_KEYS.selectedPlan,
            requestedPlan,
          );
        } else {
          localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedPlan);
        }
      } else if (requestedCredits) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedPlan);
        localStorage.setItem(
          ONBOARDING_STORAGE_KEYS.selectedCredits,
          requestedCredits.toString(),
        );
      } else if (hasRequestedCredits) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedPlan);
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedCredits);
      }

      const selectedPlan = hasRequestedPlan
        ? requestedPlan
        : localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedPlan);
      const selectedCredits =
        hasRequestedPlan || hasRequestedCredits
          ? (requestedCredits?.toString() ?? null)
          : localStorage.getItem(ONBOARDING_STORAGE_KEYS.selectedCredits);

      captureAnalyticsEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
        handoffSource: 'post_signup',
        hasCloudHandoff:
          localStorage.getItem(ONBOARDING_STORAGE_KEYS.accessMode) === 'cloud',
        hasCreditsIntent: Boolean(
          requestedCreditsParam?.trim() || selectedCredits?.trim(),
        ),
        hasPlanIntent: Boolean(selectedPlan?.trim()),
      });

      if (selectedPlan?.trim()) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedPlan);

        if (isFreePlanHandoff(selectedPlan)) {
          await redirectToOnboarding();
          return;
        }

        if (!isEEEnabled()) {
          await redirectToOnboarding();
          return;
        }

        if (!signal.aborted) {
          setStatusMessage('Preparing your plan checkout...');
        }

        try {
          const onboardingHref = await resolveOnboardingHref();
          const successPath = appendCheckoutReturnParams(
            onboardingHref,
            'plan-checkout',
          );
          const token = await resolveAuthToken(getToken);
          if (!token) {
            redirectTo('/onboarding/providers');
            return;
          }

          const service = StripeService.getInstance(token);
          const result = await service.createCheckoutSession({
            cancelUrl: `${window.location.origin}/onboarding/providers`,
            quantity: null,
            stripePriceId: selectedPlan,
            successUrl: `${window.location.origin}${successPath}`,
          });

          if (result?.url) {
            captureAnalyticsEvent(ANALYTICS_EVENTS.CHECKOUT_STARTED, {
              checkoutKind: 'plan',
              handoffSource: 'post_signup',
            });
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
                successUrl: `${window.location.origin}/managed-credits/success?session_id={CHECKOUT_SESSION_ID}&checkout=completed&checkoutKind=managed_credits`,
              },
              signal,
            );

            if (result?.url) {
              captureAnalyticsEvent(ANALYTICS_EVENTS.CHECKOUT_STARTED, {
                checkoutKind: 'managed_credits',
                handoffSource: 'post_signup',
              });
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
          const successPath = appendCheckoutReturnParams(
            onboardingHref,
            'credits-checkout',
          );
          const token = await resolveAuthToken(getToken);
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
            successUrl: `${window.location.origin}${successPath}`,
          });

          if (result?.url) {
            captureAnalyticsEvent(ANALYTICS_EVENTS.CHECKOUT_STARTED, {
              checkoutKind: 'credits',
              handoffSource: 'post_signup',
            });
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
    hasAuthUser,
    isLoading,
    requestedBrandDomainParam,
    requestedBrandNameParam,
    requestedCreditsParam,
    requestedPlanParam,
    resolveOnboardingHref,
  ]);

  return { showFallback, statusMessage, resolveOnboardingHref };
}

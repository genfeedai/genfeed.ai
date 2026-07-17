'use client';

import {
  appendCheckoutReturnParams,
  buildOnboardingResumeHref,
  isFreePlanHandoff,
  parseSelectedCredits,
} from '@app/(onboarding)/onboarding/post-signup/post-signup-routing.util';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { isSaaS, isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { isEEEnabled } from '@genfeedai/config/license';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
  getResumeStep,
  ONBOARDING_STEPS,
} from '@genfeedai/constants';
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

  // Base href for post-checkout returns. SaaS resumes in agent-first
  // onboarding; Community/Desktop retain the deterministic wizard until their
  // local/BYOK onboarding reaches parity.
  const resolveCheckoutReturnHref = useCallback(async (): Promise<string> => {
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

    if (!isSaaS()) {
      return onboardingHref;
    }

    const token = await resolveAuthToken(getToken);
    if (!token) {
      return '/';
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
    const activeOrganization =
      organizations.find((organization) => organization.isActive) ??
      organizations[0];

    return activeOrganization?.slug
      ? createOrganizationAppRoute(
          activeOrganization.slug,
          APP_ROUTES.AGENT.ONBOARDING,
        )
      : '/';
  }, [currentUser, getToken, proactiveLeadId]);

  // Resolve the active organization slug so we can build the org-scoped agent
  // onboarding route. Missing SaaS scope returns to the protected bootstrap,
  // never to the classic wizard.
  const resolveActiveOrgSlug = useCallback(async (): Promise<string | null> => {
    const token = await resolveAuthToken(getToken);
    if (!token) {
      return null;
    }

    const organizations = await OrganizationsService.getInstance(token)
      .getMyOrganizations()
      .catch((error) => {
        logger.error(
          'Failed to resolve organizations for agent onboarding routing',
          error,
        );
        return [];
      });

    const activeOrganization =
      organizations.find((organization) => organization.isActive) ??
      organizations[0];

    return activeOrganization?.slug ?? null;
  }, [getToken]);

  // Default first-run destination. Agent-first onboarding is the cloud SaaS
  // default; self-hosted/desktop keep the form wizard because the agent
  // onboarding surface needs the managed orchestrator to run.
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

    const wizardHref = buildOnboardingResumeHref(
      getResumeStep(completedSteps),
      localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain),
    );

    if (!isSaaS()) {
      return wizardHref;
    }

    const orgSlug = await resolveActiveOrgSlug();
    return orgSlug
      ? createOrganizationAppRoute(orgSlug, APP_ROUTES.AGENT.ONBOARDING)
      : '/';
  }, [currentUser, proactiveLeadId, resolveActiveOrgSlug]);

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
          const onboardingHref = await resolveCheckoutReturnHref();
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

        if (isSelfHostedDeployment()) {
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
          const onboardingHref = await resolveCheckoutReturnHref();
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
    resolveCheckoutReturnHref,
    resolveOnboardingHref,
  ]);

  return { showFallback, statusMessage, resolveOnboardingHref };
}

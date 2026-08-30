'use client';

import {
  appendCheckoutReturnParams,
  isFreePlanHandoff,
  parseSelectedCredits,
} from '@app/(onboarding)/onboarding/post-signup/post-signup-routing.util';
import {
  parseBrandOsPreviewToken,
  parsePublicYoutubeClipToken,
} from '@app/(public)/auth-callback-url';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  hasAgentFirstOnboarding,
  isSaaS,
  isSelfHostedDeployment,
} from '@genfeedai/config/deployment';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import {
  createBrandAppRoute,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/constants';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { ManagedCreditsService } from '@services/billing/managed-credits.service';
import { ReferralsService } from '@services/billing/referrals.service';
import { StripeService } from '@services/billing/stripe.service';
import { ClipProjectsService } from '@services/content/clip-projects.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANALYTICS_EVENTS,
  captureAnalyticsEvent,
  captureBrandOsFunnelStage,
} from '@/lib/analytics';
import {
  extractBrandDomain,
  ONBOARDING_STORAGE_KEYS,
  parseReferralCode,
  resolveSelectedPlanParam,
} from '@/lib/onboarding/onboarding-access.util';

export type PostSignupRoutingState = {
  showFallback: boolean;
  statusMessage: string;
  resolveOnboardingHref: () => Promise<string>;
  retryBrandOsHandoff?: (() => void) | undefined;
};

const REFERRAL_CLAIM_TIMEOUT_MS = 2_000;

export function usePostSignupRouting(): PostSignupRoutingState {
  const { getToken } = useAuthIdentity();
  const { user: authUser } = useAuthUser();
  const { currentUser, isLoading } = useCurrentUser();
  const searchParams = useSearchParams();
  const requestedPlanParam = searchParams.get('plan');
  const requestedCreditsParam = searchParams.get('credits');
  const requestedBrandDomainParam = searchParams.get('brandDomain');
  const requestedBrandNameParam = searchParams.get('brandName');
  const requestedBrandOsTokenParam = searchParams.get('brandOsToken');
  const requestedClipToolTokenParam = searchParams.get('clipToolToken');
  const requestedReferralCodeParam = searchParams.get('ref');
  const calledRef = useRef(false);
  const [routingAttempt, setRoutingAttempt] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Setting up your workspace...',
  );
  const hasAuthUser = Boolean(authUser);
  const authPrimaryEmail = authUser?.primaryEmailAddress?.emailAddress ?? '';
  const checkoutEmail = currentUser?.email || authPrimaryEmail || '';
  const hasBrandOsHandoff = Boolean(
    parseBrandOsPreviewToken(requestedBrandOsTokenParam) ||
      parsePublicYoutubeClipToken(requestedClipToolTokenParam),
  );
  const retryBrandOsHandoff = useCallback(() => {
    calledRef.current = false;
    setShowFallback(false);
    setRoutingAttempt((attempt) => attempt + 1);
  }, []);

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

  // Base href for post-checkout returns. SaaS resumes in agent-first
  // onboarding; Community/Desktop retain the deterministic wizard until their
  // local/BYOK onboarding reaches parity.
  const resolveCheckoutReturnHref = useCallback(async (): Promise<string> => {
    const completedSteps = currentUser?.onboardingStepsCompleted ?? [];
    const hasCompletedAllOnboardingSteps =
      currentUser?.isOnboardingCompleted === true ||
      ONBOARDING_STEPS.every((step) => completedSteps.includes(step));

    if (hasCompletedAllOnboardingSteps) {
      return '/';
    }

    const orgSlug = isSaaS() ? await resolveActiveOrgSlug() : null;

    return resolveForcedOnboardingHref({
      brandDomain: localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain),
      completedSteps,
      hasAgentFirstOnboarding: hasAgentFirstOnboarding(),
      orgSlug,
    });
  }, [currentUser, resolveActiveOrgSlug]);

  // Default first-run destination. Every surface starts at `/onboarding/brand`.
  // SaaS (#1726) and Community (#1835) then continue in the agent workspace;
  // the desktop client keeps providers/summary until #2380.
  const resolveOnboardingHref = useCallback(async (): Promise<string> => {
    const completedSteps = currentUser?.onboardingStepsCompleted ?? [];
    const hasCompletedAllOnboardingSteps =
      currentUser?.isOnboardingCompleted === true ||
      ONBOARDING_STEPS.every((step) => completedSteps.includes(step));

    if (hasCompletedAllOnboardingSteps) {
      return '/';
    }

    const orgSlug = hasAgentFirstOnboarding()
      ? await resolveActiveOrgSlug()
      : null;

    return resolveForcedOnboardingHref({
      brandDomain: localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain),
      completedSteps,
      hasAgentFirstOnboarding: hasAgentFirstOnboarding(),
      orgSlug,
    });
  }, [currentUser, resolveActiveOrgSlug]);

  useEffect(() => {
    if (isLoading || !currentUser || !hasAuthUser || calledRef.current) {
      return;
    }

    calledRef.current = true;
    if (routingAttempt > 0) {
      setStatusMessage('Retrying your saved preview handoff...');
    }
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

      const referralCode =
        parseReferralCode(requestedReferralCodeParam) ??
        parseReferralCode(
          localStorage.getItem(ONBOARDING_STORAGE_KEYS.referralCode),
        );
      if (referralCode) {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          logger.warn(
            'Referral attribution deferred because no auth token was available',
          );
        } else {
          let timeoutId: ReturnType<typeof window.setTimeout> | undefined;
          const claimAttempt = ReferralsService.getInstance(token)
            .claim(referralCode)
            .then(() => {
              localStorage.removeItem(ONBOARDING_STORAGE_KEYS.referralCode);
              return 'settled' as const;
            })
            .catch((error: unknown) => {
              logger.error('Failed to claim referral after auth', error);
              return 'failed' as const;
            });
          const claimOutcome = await Promise.race([
            claimAttempt,
            new Promise<'timed-out'>((resolve) => {
              timeoutId = window.setTimeout(
                () => resolve('timed-out'),
                REFERRAL_CLAIM_TIMEOUT_MS,
              );
            }),
          ]);
          if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
          }
          if (claimOutcome === 'timed-out') {
            logger.warn(
              'Referral attribution is still pending; continuing post-signup routing',
            );
          }
        }
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

      const brandOsToken = parseBrandOsPreviewToken(requestedBrandOsTokenParam);
      if (brandOsToken) {
        if (!signal.aborted) {
          setStatusMessage('Saving your Brand OS draft...');
        }
        const token = await resolveAuthToken(getToken);
        if (!token) {
          setShowFallback(true);
          return;
        }

        try {
          const organizationsService = OrganizationsService.getInstance(token);
          const organizations = await organizationsService.getMyOrganizations();
          const organization =
            organizations.find((candidate) => candidate.isActive) ??
            organizations[0];
          if (!organization) {
            setShowFallback(true);
            return;
          }

          const brands = await organizationsService.findOrganizationBrands(
            organization.id,
          );
          const brand = brands[0];
          if (!brand?.id || !brand.slug) {
            setShowFallback(true);
            return;
          }

          await BrandsService.getInstance(token).claimBrandOsPreview(brand.id, {
            previewToken: brandOsToken,
          });
          captureBrandOsFunnelStage('draft_saved');
          redirectTo(
            createBrandAppRoute(organization.slug, brand.slug, '/settings/kit'),
          );
          return;
        } catch (error) {
          logger.error('Failed to claim Brand OS preview after auth', error);
          setStatusMessage(
            'Your preview is still available. Retry to save it to your workspace.',
          );
          setShowFallback(true);
          return;
        }
      }

      const clipToolToken = parsePublicYoutubeClipToken(
        requestedClipToolTokenParam,
      );
      if (clipToolToken) {
        if (!signal.aborted) {
          setStatusMessage('Saving your clip project...');
        }
        const token = await resolveAuthToken(getToken);
        if (!token) {
          setShowFallback(true);
          return;
        }

        try {
          const organizationsService = OrganizationsService.getInstance(token);
          const organizations = await organizationsService.getMyOrganizations();
          const organization =
            organizations.find((candidate) => candidate.isActive) ??
            organizations[0];
          if (!organization) {
            setShowFallback(true);
            return;
          }

          const brands = await organizationsService.findOrganizationBrands(
            organization.id,
          );
          const brand = brands[0];
          if (!brand?.id || !brand.slug) {
            setShowFallback(true);
            return;
          }

          const claimed = await ClipProjectsService.getInstance(
            token,
          ).claimPublicYoutubeClip({
            brandId: brand.id,
            previewToken: clipToolToken,
          });
          captureAnalyticsEvent(
            ANALYTICS_EVENTS.PUBLIC_YOUTUBE_CLIP_PROJECT_CLAIMED,
            { source: 'public_preview' },
          );
          redirectTo(
            createBrandAppRoute(
              organization.slug,
              brand.slug,
              `/studio/clips/${claimed.projectId}`,
            ),
          );
          return;
        } catch (error) {
          logger.error('Failed to claim public clip project after auth', error);
          setStatusMessage(
            'Your clip preview is still available. Retry to save it to your workspace.',
          );
          setShowFallback(true);
          return;
        }
      }

      if (selectedPlan?.trim()) {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.selectedPlan);

        if (isFreePlanHandoff(selectedPlan)) {
          await redirectToOnboarding();
          return;
        }

        if (!hasOrganizationBillingHint()) {
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

        if (!hasOrganizationBillingHint()) {
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
    requestedBrandOsTokenParam,
    requestedClipToolTokenParam,
    requestedCreditsParam,
    requestedPlanParam,
    requestedReferralCodeParam,
    routingAttempt,
    resolveCheckoutReturnHref,
    resolveOnboardingHref,
  ]);

  return {
    resolveOnboardingHref,
    retryBrandOsHandoff: hasBrandOsHandoff ? retryBrandOsHandoff : undefined,
    showFallback,
    statusMessage,
  };
}

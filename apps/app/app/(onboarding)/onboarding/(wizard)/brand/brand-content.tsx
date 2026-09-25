'use client';

import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { isDesktopClient } from '@genfeedai/config/deployment';
import { OrganizationCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  resolveSignupBrandDomain,
  resolveSignupWorkspaceLabel,
} from '@genfeedai/helpers';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { logger } from '@services/core/logger.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { UsersService } from '@services/organization/users.service';
import { BrandsService } from '@services/social/brands.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ONBOARDING_STORAGE_KEYS,
  parseOnboardingAccountType,
} from '@/lib/onboarding/onboarding-access.util';
import BrandLoadingState from './brand-loading-state';
import BrandWebsitePrompt from './brand-website-prompt';

/** The loading step stays on screen at least this long — long enough to read,
 * short enough to feel instant. Real setup work runs in parallel with it. */
const MIN_LOADING_DISPLAY_MS = 1600;
/** Manual website enrichment (personal-inbox path) never holds up entry. */
const SCRAPE_TIMEOUT_MS = 6000;

type Phase = 'resolving' | 'website-prompt' | 'loading';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWebsiteUrl(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  return trimmedUrl.includes('://') ? trimmedUrl : `https://${trimmedUrl}`;
}

function BrandContentContent() {
  const { getToken } = useAuthIdentity();
  const { push } = useRouter();
  const { handleStepComplete, setAccountType: setOnboardingAccountType } =
    useOnboarding();
  const translate = useTranslations('pages.onboarding.brand');
  const searchParams = useSearchParams();
  const { currentUser, isLoading: isUserLoading } = useCurrentUser();

  const storedBrandDomain =
    typeof window !== 'undefined'
      ? localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain)
      : null;

  // Work-email domains carry a real brand signal and skip straight to the
  // loading step; personal inboxes (gmail.com, …) get asked for a website
  // first. `resolveSignupBrandDomain` is the same classifier the signup
  // prefill background job already used to set the brand up from the
  // domain, so the two stay in lockstep.
  const resolved = resolveSignupBrandDomain({
    email: currentUser?.email,
    requestedDomain: searchParams.get('brandDomain') ?? storedBrandDomain,
  });
  const isPersonalInbox = resolved.source === 'none';

  const [phase, setPhase] = useState<Phase>('resolving');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const orgIdRef = useRef<string | null>(null);
  const setupStartedRef = useRef(false);
  const phaseResolvedRef = useRef(false);

  // The classifier needs `currentUser.email`, which loads asynchronously —
  // decide the phase once it is available instead of guessing at mount.
  useEffect(() => {
    if (isUserLoading || phaseResolvedRef.current) {
      return;
    }
    phaseResolvedRef.current = true;
    setPhase(isPersonalInbox ? 'website-prompt' : 'loading');
  }, [isUserLoading, isPersonalInbox]);

  const resolveWorkspaceIds = useCallback(
    async (token: string): Promise<{ brandId: string; orgId: string }> => {
      const usersService = UsersService.getInstance(token);
      const [brands, organizations] = await Promise.all([
        usersService.findMeBrands({ limit: 1 }),
        usersService.findMeOrganizations(),
      ]);
      const brandId = brands[0]?.id ?? null;
      const orgId = organizations[0]?.id ?? null;
      orgIdRef.current = orgId;

      if (!brandId || !orgId) {
        throw new Error('No workspace found for the current user');
      }

      return { brandId, orgId };
    },
    [],
  );

  const finishOnboarding = useCallback(async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        if (isDesktopClient()) {
          push(APP_ROUTES.DESKTOP.LOCAL);
          return;
        }
        throw new Error('Authentication is unavailable');
      }

      const orgId =
        orgIdRef.current ?? (await resolveWorkspaceIds(token)).orgId;

      // Skip completes the onboarding *gate* so we do not force it again.
      // Brand setup stays reachable at `/onboarding/brand` for later.
      await OrganizationsService.getInstance(token).patchSettings(orgId, {
        isFirstLogin: false,
      });
      await UsersService.getInstance(token).patchMe({
        isOnboardingCompleted: true,
      });
      push('/');
    } catch (error) {
      logger.error('Failed to skip onboarding', error);
      setErrorMessage(translate('errors.skip'));
      setSubmitting(false);
    }
  }, [getToken, push, resolveWorkspaceIds, translate]);

  const runSetup = useCallback(
    async (manualWebsiteUrl: string, signal: AbortSignal) => {
      setSubmitting(true);
      setErrorMessage(null);

      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          throw new Error('Authentication is unavailable');
        }

        const { brandId, orgId } = await resolveWorkspaceIds(token);
        if (signal.aborted) return;

        const requestedAccountType = parseOnboardingAccountType(
          searchParams.get('accountType') ??
            localStorage.getItem(ONBOARDING_STORAGE_KEYS.accountType),
        );
        const accountType =
          requestedAccountType ?? OrganizationCategory.CREATOR;
        const brandName =
          resolved.brandName ||
          resolveSignupWorkspaceLabel({
            email: currentUser?.email,
            name: currentUser?.name,
          });
        const effectiveWebsiteUrl =
          normalizeWebsiteUrl(manualWebsiteUrl) ?? resolved.websiteUrl;

        const setupWork = (async () => {
          // Every step here is best-effort: a single failure must never
          // strand the operator on the loading screen.
          try {
            await OrganizationsService.getInstance(token).updateAccountType(
              orgId,
              accountType,
            );
            setOnboardingAccountType(accountType);
            localStorage.removeItem(ONBOARDING_STORAGE_KEYS.accountType);
          } catch (error) {
            logger.error('Failed to set account type during onboarding', error);
          }

          try {
            await BrandsService.getInstance(token).renameWithOrganizationSync(
              brandId,
              brandName,
              { organizationLabel: brandName },
            );
          } catch (error) {
            logger.error(
              'Failed to name the workspace during onboarding',
              error,
            );
          }

          if (effectiveWebsiteUrl) {
            try {
              await Promise.race([
                BrandsService.getInstance(token).scrape(brandId, {
                  brandName,
                  brandUrl: effectiveWebsiteUrl,
                  organizationName: brandName,
                }),
                delay(SCRAPE_TIMEOUT_MS),
              ]);
            } catch (error) {
              logger.error('Brand enrichment failed during onboarding', error);
            }
          }

          try {
            await OnboardingService.getInstance(token).queueStarterAssets(
              brandId,
              effectiveWebsiteUrl ?? undefined,
            );
          } catch (error) {
            logger.error('Failed to queue onboarding starter assets', error);
            toast.error(translate('errors.starterAssets'));
          }
        })();

        await Promise.all([setupWork, delay(MIN_LOADING_DISPLAY_MS)]);
        if (signal.aborted) return;

        await handleStepComplete('brand');
      } catch (error) {
        if (signal.aborted) return;
        logger.error('Failed to continue onboarding', error);
        setErrorMessage(translate('errors.continue'));
        setSubmitting(false);
      }
    },
    [
      currentUser?.email,
      currentUser?.name,
      getToken,
      handleStepComplete,
      resolved.brandName,
      resolved.websiteUrl,
      resolveWorkspaceIds,
      searchParams,
      setOnboardingAccountType,
      translate,
    ],
  );

  // `runSetup` is recreated whenever any of its inputs change identity
  // (`translate` in particular is not stable across renders). Keep the
  // latest version in a ref instead of a dependency: depending on `runSetup`
  // directly would re-fire this effect on every such render, and the cleanup
  // below would abort the in-flight setup before it ever reaches the network
  // calls it exists to make.
  const runSetupRef = useRef(runSetup);
  runSetupRef.current = runSetup;

  // Runs once the loading phase is reached — cancellable so a fast unmount
  // (or a switch back to the website prompt) never lets a stale run complete
  // onboarding underneath the operator.
  useEffect(() => {
    if (phase !== 'loading' || setupStartedRef.current) {
      return;
    }
    setupStartedRef.current = true;

    const controller = new AbortController();
    void runSetupRef.current(websiteUrl, controller.signal);

    return () => {
      controller.abort();
    };
  }, [phase, websiteUrl]);

  const handleWebsiteContinue = useCallback(() => {
    setPhase('loading');
  }, []);

  if (phase === 'website-prompt') {
    return (
      <BrandWebsitePrompt
        websiteUrl={websiteUrl}
        submitting={submitting}
        errorMessage={errorMessage}
        onWebsiteUrlChange={setWebsiteUrl}
        onContinue={handleWebsiteContinue}
        onSkip={() => void finishOnboarding()}
      />
    );
  }

  return (
    <BrandLoadingState
      errorMessage={errorMessage}
      submitting={submitting}
      onSkip={() => void finishOnboarding()}
    />
  );
}

export default function BrandContent() {
  return (
    <div>
      <Suspense fallback={null}>
        <BrandContentContent />
      </Suspense>
    </div>
  );
}

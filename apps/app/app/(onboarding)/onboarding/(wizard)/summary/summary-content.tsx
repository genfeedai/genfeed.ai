'use client';

import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { OnboardingAccessMode } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import type { AccessBootstrapState } from '@services/auth/auth.service';
import { AuthService } from '@services/auth/auth.service';
import { logger } from '@services/core/logger.service';
import type { InstallReadinessResponse } from '@services/onboarding/onboarding.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { UsersService } from '@services/organization/users.service';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';

import {
  buildGenfeedCloudSignupUrl,
  buildOnboardingAccessSettingsPatch,
  formatSubscriptionStatusLabel,
  formatSubscriptionTierLabel,
  ONBOARDING_STORAGE_KEYS,
} from '@/lib/onboarding/onboarding-access.util';

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
    selector: '.summary-card',
    stagger: 0.08,
  },
];

const EMPTY_READINESS: InstallReadinessResponse = {
  access: {
    byokConfiguredProviders: [],
    byokEnabled: false,
    runtimeMode: 'server',
    selectedMode: null,
    serverDefaultsReady: false,
  },
  authMode: 'better_auth',
  billingMode: 'oss_local',
  localTools: {
    anyDetected: false,
    claude: false,
    codex: false,
    detected: [],
  },
  providers: {
    anyConfigured: false,
    configured: [],
    fal: false,
    imageGenerationReady: false,
    openai: false,
    replicate: false,
    textGenerationReady: false,
  },
  ui: {
    showBilling: false,
    showCloudUpgradeCta: true,
    showCredits: false,
    showLocalTools: false,
    showPricing: false,
  },
  workspace: {
    brandId: null,
    hasBrand: false,
    hasOrganization: false,
    organizationId: null,
  },
};

function formatSelectedAccessLabel(
  readiness: InstallReadinessResponse,
): string {
  if (readiness.access.selectedMode === 'cloud') {
    return 'Genfeed Cloud selected';
  }

  if (readiness.access.selectedMode === 'byok') {
    return 'BYOK selected';
  }

  if (readiness.access.selectedMode === 'server') {
    return 'Server defaults selected';
  }

  if (readiness.access.runtimeMode === 'byok') {
    const configuredProviders =
      readiness.access.byokConfiguredProviders.join(', ');

    return configuredProviders
      ? `BYOK currently active for ${configuredProviders}`
      : 'BYOK currently active';
  }

  return readiness.access.serverDefaultsReady
    ? 'Server defaults first, BYOK optional'
    : 'No server defaults detected yet';
}

const CURRENT_RING = 'ring-1 ring-border-strong';

function CurrentBadge() {
  return (
    <span className="absolute -top-2 right-3 z-10 rounded-full bg-hover px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-foreground">
      Current
    </span>
  );
}

export default function SummaryContent() {
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const { getToken } = useAuthIdentity();
  const { currentUser } = useCurrentUser();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const getAuthService = useAuthedService((token: string) =>
    AuthService.getInstance(token),
  );
  const { push } = useRouter();
  const [pendingMode, setPendingMode] = useState<OnboardingAccessMode | null>(
    null,
  );
  const [readiness, setReadiness] =
    useState<InstallReadinessResponse>(EMPTY_READINESS);
  const [billingState, setBillingState] = useState<AccessBootstrapState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadReadiness = async () => {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token || cancelled) {
          setLoading(false);
          return;
        }

        const service = OnboardingService.getInstance(token);
        const response = await service.getInstallReadiness();

        if (cancelled) {
          return;
        }

        setReadiness(response);

        // In billing-enabled (cloud/SaaS) deployments, surface the user's real
        // subscription tier and credit balance so a replayed summary reflects
        // what they already have instead of a blank or OSS-only view.
        if (response.ui.showBilling) {
          try {
            const authService = await getAuthService();
            const bootstrap = await authService.getBootstrap();

            if (!cancelled) {
              setBillingState(bootstrap.access);
            }
          } catch (billingError) {
            logger.error(
              'Failed to load billing state for onboarding summary',
              billingError,
            );
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadReadiness();

    return () => {
      cancelled = true;
    };
  }, [getToken, getAuthService]);

  const workspaceStatus = useMemo(() => {
    if (readiness.workspace.hasOrganization && readiness.workspace.hasBrand) {
      return 'Ready';
    }

    return 'Still bootstrapping';
  }, [readiness.workspace.hasBrand, readiness.workspace.hasOrganization]);

  const localToolsLabel = useMemo(() => {
    if (loading) {
      return 'Checking...';
    }

    if (readiness.localTools.anyDetected) {
      return readiness.localTools.detected.join(', ');
    }

    return 'None detected';
  }, [loading, readiness.localTools]);

  const providersLabel = useMemo(() => {
    if (loading) {
      return 'Checking...';
    }

    if (readiness.providers.anyConfigured) {
      return readiness.providers.configured.join(', ');
    }

    return 'None configured';
  }, [loading, readiness.providers]);

  const accessModeLabel = useMemo(() => {
    if (loading) {
      return 'Checking...';
    }

    return formatSelectedAccessLabel(readiness);
  }, [loading, readiness]);

  const persistAccessMode = async (accessMode: OnboardingAccessMode) => {
    if (!currentUser) {
      return;
    }

    try {
      const service = await getUsersService();
      const patch = buildOnboardingAccessSettingsPatch({
        accessMode,
        currentSettings: currentUser.settings,
      });

      await service.patchSettings(currentUser.id, patch);
    } catch (error) {
      logger.error('Failed to persist onboarding access mode', error);
    }
  };

  const handleByokClick = async (
    event: MouseEvent<HTMLAnchorElement>,
  ): Promise<void> => {
    event.preventDefault();

    if (pendingMode || loading) {
      return;
    }

    setPendingMode('byok');
    await persistAccessMode('byok');
    push(APP_ROUTES.SETTINGS.API_KEYS);
  };

  const handleContinueSelfHosted = async () => {
    setPendingMode('server');
    await persistAccessMode('server');
    push(APP_ROUTES.ONBOARDING.SUCCESS);
  };

  const handleCloudContinue = async () => {
    setPendingMode('cloud');
    await persistAccessMode('cloud');

    const cloudSignupUrl = buildGenfeedCloudSignupUrl({
      accessMode: 'cloud',
      brandDomain: localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain),
      brandName: localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName),
    });

    window.location.assign(cloudSignupUrl);
  };

  return (
    <div ref={sectionRef}>
      <h1 className="step-headline opacity-0 mb-4 text-4xl font-semibold leading-none tracking-tight text-foreground md:text-5xl text-balance">
        Finish with the setup that fits.
      </h1>

      <p className="step-description opacity-0 mb-10 max-w-2xl text-lg text-muted-foreground">
        Your self-hosted install is ready to use the server defaults, but you
        can still switch to Genfeed Cloud if you want a managed path with the
        same brand context carried into signup.
      </p>

      <div className="space-y-5">
        {readiness.ui.showBilling ? (
          <div className="summary-card opacity-0 border border-border bg-background-secondary p-5 md:p-6">
            <h2 className="text-lg font-semibold text-foreground">Your plan</h2>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
                <span className="text-muted-foreground">Subscription</span>
                <span className="text-right text-foreground">
                  {loading
                    ? 'Checking...'
                    : formatSubscriptionTierLabel(
                        billingState?.subscriptionTier,
                      )}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
                <span className="text-muted-foreground">Status</span>
                <span className="text-right text-foreground">
                  {loading
                    ? 'Checking...'
                    : formatSubscriptionStatusLabel(
                        billingState?.subscriptionStatus,
                      )}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
                <span className="text-muted-foreground">Credits balance</span>
                <span className="text-right text-foreground">
                  {loading
                    ? 'Checking...'
                    : (billingState?.creditsBalance ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="summary-card opacity-0 border border-border bg-background-secondary p-5 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Install summary
          </h2>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <span className="text-muted-foreground">Auth</span>
              <span className="text-foreground">{readiness.authMode}</span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
              <span className="text-muted-foreground">Workspace</span>
              <span className="text-foreground">{workspaceStatus}</span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
              <span className="text-muted-foreground">Local tools</span>
              <span className="text-right text-foreground">
                {localToolsLabel}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
              <span className="text-muted-foreground">Default access</span>
              <span className="text-right text-foreground">
                {accessModeLabel}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
              <span className="text-muted-foreground">Hosted providers</span>
              <span className="text-right text-foreground">
                {providersLabel}
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
            Default behavior: use the providers configured on this server. Add
            your own key later in{' '}
            <span className="text-foreground">
              Settings → Organization → API Keys
            </span>{' '}
            if you want BYOK overrides or this install is missing a provider you
            need.
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <div className="relative w-full md:w-auto">
              {readiness.access.selectedMode === 'byok' ? (
                <CurrentBadge />
              ) : null}
              <Link
                href={APP_ROUTES.SETTINGS.API_KEYS}
                onClick={(event) => {
                  void handleByokClick(event);
                }}
                className={`inline-flex w-full items-center justify-center rounded-full border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:border-border-strong hover:bg-hover hover:text-foreground md:w-auto ${
                  readiness.access.selectedMode === 'byok' ? CURRENT_RING : ''
                }`}
              >
                Add my own API keys
              </Link>
            </div>

            <div className="relative w-full md:w-auto">
              {readiness.access.selectedMode === 'server' ? (
                <CurrentBadge />
              ) : null}
              <Button
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.SM}
                onClick={() => {
                  void handleContinueSelfHosted();
                }}
                label={
                  pendingMode === 'server'
                    ? 'Saving self-hosted mode...'
                    : 'Continue with self-hosted'
                }
                disabled={loading || pendingMode !== null}
                className={`w-full md:w-auto ${
                  readiness.access.selectedMode === 'server' ? CURRENT_RING : ''
                }`}
              />
            </div>
          </div>
        </div>

        <div className="summary-card opacity-0 flex flex-col gap-4 border border-border bg-background-secondary p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Want Genfeed Cloud to manage provider keys, credits, and infra for
            you? Start with the managed path instead and carry this brand setup
            forward into cloud onboarding.
          </div>

          <div className="relative w-full md:w-auto">
            {readiness.access.selectedMode === 'cloud' ? (
              <CurrentBadge />
            ) : null}
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => {
                void handleCloudContinue();
              }}
              label={
                pendingMode === 'cloud'
                  ? 'Opening Genfeed Cloud...'
                  : 'Continue to Genfeed Cloud'
              }
              icon={<ArrowUpRight className="size-4" />}
              disabled={loading || pendingMode !== null}
              className={`w-full rounded-full border border-border bg-secondary text-foreground/80 hover:border-border-strong hover:bg-hover hover:text-foreground md:w-auto ${
                readiness.access.selectedMode === 'cloud' ? CURRENT_RING : ''
              }`}
            />
          </div>
        </div>

        <div className="summary-card opacity-0 flex items-center justify-between gap-4 pt-2">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            withWrapper={false}
            onClick={() => push(APP_ROUTES.ONBOARDING.PROVIDERS)}
            icon={<ArrowLeft className="size-4" />}
            className="h-8 rounded-full border border-border bg-secondary px-4 text-muted-foreground hover:border-border-strong hover:bg-hover hover:text-foreground"
          >
            Back
          </Button>

          <div className="step-badge inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border bg-muted px-4 text-2xs font-black uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="size-3" />
            Step 3 of 3
          </div>
        </div>
      </div>
    </div>
  );
}

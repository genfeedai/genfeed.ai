'use client';

import { useAuth } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { OnboardingAccessMode } from '@genfeedai/interfaces';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import type { InstallReadinessResponse } from '@services/onboarding/onboarding.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { UsersService } from '@services/organization/users.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { HiArrowLeft, HiCheckCircle, HiKey, HiSparkles } from 'react-icons/hi2';
import {
  buildGenfeedCloudSignupUrl,
  buildOnboardingAccessSettingsPatch,
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
    selector: '.provider-card',
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
  authMode: 'clerk',
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
    showPricing: false,
  },
  workspace: {
    brandId: null,
    hasBrand: false,
    hasOrganization: false,
    organizationId: null,
  },
};

function formatAccessStatus(readiness: InstallReadinessResponse): string {
  if (readiness.access.selectedMode === 'cloud') {
    return 'Saved choice: Genfeed Cloud';
  }

  if (readiness.access.selectedMode === 'byok') {
    return 'Saved choice: Bring your own keys';
  }

  if (readiness.access.selectedMode === 'server') {
    return 'Saved choice: Server defaults';
  }

  if (readiness.access.runtimeMode === 'byok') {
    const configuredProviders =
      readiness.access.byokConfiguredProviders.join(', ');

    return configuredProviders
      ? `Runtime: BYOK active for ${configuredProviders}`
      : 'Runtime: BYOK active';
  }

  if (readiness.access.serverDefaultsReady) {
    return 'Runtime: server defaults are ready';
  }

  return 'No server defaults detected yet';
}

export default function ProvidersContent() {
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const { getToken } = useAuth();
  const { currentUser } = useCurrentUser();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<OnboardingAccessMode | null>(
    null,
  );
  const [readiness, setReadiness] =
    useState<InstallReadinessResponse>(EMPTY_READINESS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadReadiness = async () => {
      try {
        const token = await resolveClerkToken(getToken);
        if (!token || cancelled) {
          setLoading(false);
          return;
        }

        const service = OnboardingService.getInstance(token);
        const response = await service.getInstallReadiness();

        if (!cancelled) {
          setReadiness(response);
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
  }, [getToken]);

  const providerRows = useMemo(
    () => [
      {
        description: 'Image and video generation for OSS installs.',
        enabled: readiness.providers.replicate,
        key: 'Replicate',
      },
      {
        description: 'Fast image and media generation from fal.ai.',
        enabled: readiness.providers.fal,
        key: 'fal.ai',
      },
      {
        description: 'General-purpose text and assistant capabilities.',
        enabled: readiness.providers.openai,
        key: 'OpenAI',
      },
    ],
    [readiness.providers],
  );

  const localToolRows = useMemo(
    () => [
      {
        description: 'Recommended for local agent chat and task execution.',
        enabled: readiness.localTools.codex,
        key: 'Codex CLI',
      },
      {
        description: 'Recommended for local agent chat and desktop workflows.',
        enabled: readiness.localTools.claude,
        key: 'Claude CLI',
      },
    ],
    [readiness.localTools],
  );

  const accessStatusLabel = useMemo(() => {
    if (loading) {
      return 'Checking current access state...';
    }

    return formatAccessStatus(readiness);
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

  const handleServerContinue = async () => {
    setPendingMode('server');
    await persistAccessMode('server');
    router.push('/onboarding/summary');
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
    router.push('/settings/api-keys');
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
      <h1 className="step-headline opacity-0 mb-4 text-4xl font-serif leading-none tracking-tighter text-white md:text-5xl">
        Configure your <span className="font-light italic">access.</span>
      </h1>

      <p className="step-description opacity-0 mb-10 max-w-2xl text-lg text-white/40">
        Genfeed uses the keys configured on this server by default. Add your own
        API keys only if you want BYOK overrides, or switch to Genfeed Cloud if
        you want the managed path instead.
      </p>

      <div className="space-y-5">
        <div className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Default access</h2>
            <p className="mt-2 text-sm text-white/45">
              Server defaults come first. If you save your own provider key
              later, Genfeed will use your organization&apos;s key instead.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-4 text-sm text-white/55">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
              <HiSparkles className="h-3.5 w-3.5" />
              Server Defaults First
            </div>
            <p>
              Start with the server configuration, then bring your own keys
              later from Organization → API Keys if you want provider control or
              BYOK billing.
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-emerald-200/80">
              {accessStatusLabel}
            </p>
          </div>
        </div>

        <div className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">
              Local agent tools
            </h2>
            <p className="mt-2 text-sm text-white/45">
              Optional, but recommended for localhost installs that want to use
              the agent with local CLI tools.
            </p>
          </div>

          <div className="space-y-3">
            {localToolRows.map((tool) => (
              <div
                key={tool.key}
                className="flex flex-col gap-3 border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white">
                    {tool.key}
                  </h3>
                  <p className="mt-1 text-sm text-white/45">
                    {tool.description}
                  </p>
                </div>
                <div
                  className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs ${
                    tool.enabled
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : 'bg-white/[0.06] text-white/45'
                  }`}
                >
                  {tool.enabled ? (
                    <HiCheckCircle className="h-4 w-4" />
                  ) : (
                    <HiKey className="h-4 w-4" />
                  )}
                  {tool.enabled ? 'Detected' : 'Not detected'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">
              Server-configured providers
            </h2>
            <p className="mt-2 text-sm text-white/45">
              These providers are already wired into this install. If one is
              missing here, you can still add your own key later.
            </p>
          </div>

          <div className="space-y-3">
            {providerRows.map((provider) => (
              <div
                key={provider.key}
                className="flex flex-col gap-3 border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white">
                    {provider.key}
                  </h3>
                  <p className="mt-1 text-sm text-white/45">
                    {provider.description}
                  </p>
                </div>
                <div
                  className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs ${
                    provider.enabled
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : 'bg-white/[0.06] text-white/45'
                  }`}
                >
                  {provider.enabled ? (
                    <HiCheckCircle className="h-4 w-4" />
                  ) : (
                    <HiKey className="h-4 w-4" />
                  )}
                  {provider.enabled ? 'Server ready' : 'Missing server key'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="provider-card opacity-0 flex flex-col gap-4 border border-white/[0.08] bg-white/[0.02] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="text-sm text-white/45">
            Keep the default server access, open Organization API Keys if you
            want BYOK, or switch to Genfeed Cloud now if you want a managed
            setup with brand handoff.
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <Link
              href="/settings/api-keys"
              onClick={(event) => {
                void handleByokClick(event);
              }}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
            >
              Add my own API keys
            </Link>

            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              onClick={() => {
                void handleServerContinue();
              }}
              label={
                loading
                  ? 'Loading summary...'
                  : pendingMode === 'server'
                    ? 'Saving server mode...'
                    : 'Continue with server defaults'
              }
              disabled={loading || pendingMode !== null}
              className="w-full md:w-auto"
            />

            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => {
                void handleCloudContinue();
              }}
              label={
                pendingMode === 'cloud'
                  ? 'Opening Genfeed Cloud...'
                  : 'Use Genfeed Cloud'
              }
              disabled={loading || pendingMode !== null}
              className="w-full rounded-full border border-white/10 bg-white/[0.03] text-white/75 hover:border-white/15 hover:bg-white/[0.06] hover:text-white md:w-auto"
            />
          </div>
        </div>

        <div className="provider-card opacity-0 flex items-center justify-between gap-4 pt-2">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            withWrapper={false}
            onClick={() => router.push('/onboarding/brand')}
            icon={<HiArrowLeft className="h-4 w-4" />}
            className="h-8 rounded-full border border-white/10 bg-white/[0.03] px-4 text-white/45 hover:border-white/15 hover:bg-white/[0.06] hover:text-white/75"
          >
            Back
          </Button>

          <div className="step-badge inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
            <HiSparkles className="h-3 w-3" />
            Step 2 of 3
          </div>
        </div>
      </div>
    </div>
  );
}

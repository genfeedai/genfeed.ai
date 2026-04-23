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
import { HiArrowLeft, HiArrowUpRight, HiSparkles } from 'react-icons/hi2';
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

export default function SummaryContent() {
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
    router.push('/settings/organization/api-keys');
  };

  const handleContinueSelfHosted = async () => {
    setPendingMode('server');
    await persistAccessMode('server');
    router.push('/onboarding/success');
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
        Finish with the setup{' '}
        <span className="font-light italic">that fits.</span>
      </h1>

      <p className="step-description opacity-0 mb-10 max-w-2xl text-lg text-white/40">
        Your self-hosted install is ready to use the server defaults, but you
        can still switch to Genfeed Cloud if you want a managed path with the
        same brand context carried into signup.
      </p>

      <div className="space-y-5">
        <div className="summary-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
          <h2 className="text-lg font-semibold text-white">Install summary</h2>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4 border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0">
              <span className="text-white/45">Auth</span>
              <span className="text-white">{readiness.authMode}</span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-white/[0.06] pt-3">
              <span className="text-white/45">Workspace</span>
              <span className="text-white">{workspaceStatus}</span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-white/[0.06] pt-3">
              <span className="text-white/45">Local tools</span>
              <span className="text-right text-white">{localToolsLabel}</span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-white/[0.06] pt-3">
              <span className="text-white/45">Default access</span>
              <span className="text-right text-white">{accessModeLabel}</span>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-white/[0.06] pt-3">
              <span className="text-white/45">Hosted providers</span>
              <span className="text-right text-white">{providersLabel}</span>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/45">
            Default behavior: use the providers configured on this server. Add
            your own key later in{' '}
            <span className="text-white">
              Settings → Organization → API Keys
            </span>{' '}
            if you want BYOK overrides or this install is missing a provider you
            need.
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <Link
              href="/settings/organization/api-keys"
              onClick={(event) => {
                void handleByokClick(event);
              }}
              className="inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white md:w-auto"
            >
              Add my own API keys
            </Link>

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
              className="w-full md:w-auto"
            />
          </div>
        </div>

        <div className="summary-card opacity-0 flex flex-col gap-4 border border-white/[0.08] bg-white/[0.02] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="max-w-2xl text-sm leading-6 text-white/45">
            Want Genfeed Cloud to manage provider keys, credits, and infra for
            you? Start with the managed path instead and carry this brand setup
            forward into cloud onboarding.
          </div>

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
            icon={<HiArrowUpRight className="h-4 w-4" />}
            disabled={loading || pendingMode !== null}
            className="w-full rounded-full border border-white/10 bg-white/[0.03] text-white/75 hover:border-white/15 hover:bg-white/[0.06] hover:text-white md:w-auto"
          />
        </div>

        <div className="summary-card opacity-0 flex items-center justify-between gap-4 pt-2">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            withWrapper={false}
            onClick={() => router.push('/onboarding/providers')}
            icon={<HiArrowLeft className="h-4 w-4" />}
            className="h-8 rounded-full border border-white/10 bg-white/[0.03] px-4 text-white/45 hover:border-white/15 hover:bg-white/[0.06] hover:text-white/75"
          >
            Back
          </Button>

          <div className="step-badge inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
            <HiSparkles className="h-3 w-3" />
            Step 3 of 3
          </div>
        </div>
      </div>
    </div>
  );
}

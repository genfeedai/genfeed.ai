'use client';

import { useAuth } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import type { OnboardingAccessMode } from '@genfeedai/interfaces';
import { resolveAuthToken } from '@helpers/auth/clerk.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import type { InstallReadinessResponse } from '@services/onboarding/onboarding.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { UsersService } from '@services/organization/users.service';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import {
  buildGenfeedCloudSignupUrl,
  buildOnboardingAccessSettingsPatch,
  ONBOARDING_STORAGE_KEYS,
} from '@/lib/onboarding/onboarding-access.util';
import ProvidersActionBar from './providers-action-bar';
import ProvidersServerList from './providers-server-list';
import ProvidersStatusCard from './providers-status-card';
import ProvidersToolList from './providers-tool-list';

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
  const { push } = useRouter();
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
        const token = await resolveAuthToken(getToken);
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
    push('/onboarding/summary');
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
    push('/settings/api-keys');
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
        <ProvidersStatusCard accessStatusLabel={accessStatusLabel} />

        <ProvidersToolList localToolRows={localToolRows} />

        <ProvidersServerList providerRows={providerRows} />

        <ProvidersActionBar
          loading={loading}
          pendingMode={pendingMode}
          onByokClick={(event) => {
            void handleByokClick(event);
          }}
          onServerContinue={() => {
            void handleServerContinue();
          }}
          onCloudContinue={() => {
            void handleCloudContinue();
          }}
          onBack={() => push('/onboarding/brand')}
        />
      </div>
    </div>
  );
}

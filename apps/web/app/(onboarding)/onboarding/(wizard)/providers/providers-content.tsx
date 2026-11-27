'use client';

import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { OnboardingAccessMode } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import type { InstallReadinessResponse } from '@services/onboarding/onboarding.service';
import { UsersService } from '@services/organization/users.service';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useMemo, useState } from 'react';
import { useInstallReadiness } from '@/hooks/data/onboarding/use-install-readiness/use-install-readiness';
import {
  buildGenfeedCloudSignupUrl,
  buildOnboardingAccessSettingsPatch,
  ONBOARDING_STORAGE_KEYS,
} from '@/lib/onboarding/onboarding-access.util';
import ProvidersActionBar, {
  type ProvidersAccessSurface,
} from './providers-action-bar';
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
  const translate = useTranslations('pages.onboarding.providers');
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const { currentUser } = useCurrentUser();
  const { handleStepComplete } = useOnboarding();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const { push } = useRouter();
  const [pendingMode, setPendingMode] = useState<OnboardingAccessMode | null>(
    null,
  );
  const {
    isLoading: loading,
    markAccessModeSaved,
    readiness,
  } = useInstallReadiness({ enabled: true });

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
        description: translate('openRouterDescription'),
        enabled: readiness.providers.openrouter,
        key: 'OpenRouter',
      },
      {
        description: 'Optional native OpenAI models.',
        enabled: readiness.providers.openai,
        key: 'OpenAI',
      },
    ],
    [readiness.providers, translate],
  );

  const localToolRows = useMemo(() => {
    const claude = readiness.localTools?.claude ?? false;
    const codex = readiness.localTools?.codex ?? false;
    return [
      {
        description: 'Recommended for local agent chat and desktop workflows.',
        enabled: claude,
        key: 'Claude CLI',
      },
      {
        description: 'Recommended for local agent chat and task execution.',
        enabled: codex,
        key: 'Codex CLI',
      },
    ];
  }, [readiness.localTools]);

  const accessSurface: ProvidersAccessSurface = readiness.ui.showCredits
    ? 'saas'
    : 'self-hosted';

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
      await markAccessModeSaved(accessMode);
    } catch (error) {
      logger.error('Failed to persist onboarding access mode', error);
    }
  };

  const handleServerContinue = async () => {
    setPendingMode('server');
    await persistAccessMode('server');
    await handleStepComplete('providers');
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
    await handleStepComplete('providers');
    push(APP_ROUTES.CONNECTORS.API_KEYS);
  };

  const handleCloudContinue = async () => {
    setPendingMode('cloud');
    await persistAccessMode('cloud');
    await handleStepComplete('providers');

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
        Configure your access.
      </h1>

      <p className="step-description opacity-0 mb-10 max-w-2xl text-lg text-muted-foreground">
        {accessSurface === 'saas'
          ? 'Use Genfeed Cloud for hosted generation, or bring your own provider keys with a Scale plan.'
          : 'Genfeed uses the server-configured providers by default. Add your own provider API keys only if you want to override hosted access, or switch to Genfeed Cloud if you want the managed path instead.'}
      </p>

      <div className="space-y-5">
        {accessSurface === 'self-hosted' ? (
          <ProvidersStatusCard accessStatusLabel={accessStatusLabel} />
        ) : null}

        {readiness.ui.showLocalTools ? (
          <ProvidersToolList localToolRows={localToolRows} />
        ) : null}

        {accessSurface === 'self-hosted' ? (
          <ProvidersServerList providerRows={providerRows} />
        ) : null}

        <ProvidersActionBar
          loading={loading}
          pendingMode={pendingMode}
          selectedMode={readiness.access.selectedMode}
          surface={accessSurface}
          onByokClick={(event) => {
            void handleByokClick(event);
          }}
          onServerContinue={() => {
            void handleServerContinue();
          }}
          onCloudContinue={() => {
            void handleCloudContinue();
          }}
          onBack={() => push(APP_ROUTES.ONBOARDING.BRAND)}
        />
      </div>
    </div>
  );
}

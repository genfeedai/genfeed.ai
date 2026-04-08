'use client';

import { useAuth } from '@clerk/nextjs';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import type { InstallReadinessResponse } from '@services/onboarding/onboarding.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  HiArrowLeft,
  HiCheckCircle,
  HiCloudArrowUp,
  HiKey,
  HiSparkles,
} from 'react-icons/hi2';

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

export default function ProvidersContent() {
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const { getToken } = useAuth();
  const router = useRouter();
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

  const handleContinue = () => {
    router.push('/onboarding/success');
  };

  return (
    <div ref={sectionRef}>
      <Button
        variant={ButtonVariant.GHOST}
        size={ButtonSize.SM}
        onClick={() => router.push('/onboarding/brand')}
        icon={<HiArrowLeft className="h-4 w-4" />}
        className="text-white/40 hover:text-white/70 mb-8"
      >
        Back
      </Button>

      <div className="step-badge opacity-0 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-8">
        <HiSparkles className="h-3 w-3" />
        Step 2 of 2
      </div>

      <h1 className="step-headline opacity-0 mb-4 text-4xl font-serif leading-none tracking-tighter text-white md:text-5xl">
        Configure your <span className="font-light italic">providers.</span>
      </h1>

      <p className="step-description opacity-0 mb-12 max-w-2xl text-lg text-white/40">
        Check the local tools and hosted providers available on this install.
        Claude and Codex help with local agent workflows, while Replicate,
        fal.ai, and OpenAI power hosted models when you want them.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-6">
              <h2 className="text-lg font-semibold text-white">
                Local agent tools
              </h2>
              <p className="mt-2 text-sm text-white/45">
                Optional, but recommended for localhost installs that want to
                use the agent with local CLI tools.
              </p>
            </div>

            {localToolRows.map((tool) => (
              <div
                key={tool.key}
                className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {tool.key}
                    </h2>
                    <p className="mt-2 text-sm text-white/45">
                      {tool.description}
                    </p>
                  </div>
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
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
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-6">
              <h2 className="text-lg font-semibold text-white">
                Hosted providers
              </h2>
              <p className="mt-2 text-sm text-white/45">
                Connect hosted model providers if you want remote generation and
                cloud-backed workflows.
              </p>
            </div>

            {providerRows.map((provider) => (
              <div
                key={provider.key}
                className="provider-card opacity-0 border border-white/[0.08] bg-white/[0.02] p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {provider.key}
                    </h2>
                    <p className="mt-2 text-sm text-white/45">
                      {provider.description}
                    </p>
                  </div>
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
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
                    {provider.enabled ? 'Configured' : 'Missing env key'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="provider-card opacity-0 space-y-4 border border-white/[0.08] bg-white/[0.02] p-6">
          <h2 className="text-lg font-semibold text-white">Install status</h2>
          <div className="space-y-3 text-sm text-white/55">
            <p>
              Auth: <span className="text-white">{readiness.authMode}</span>
            </p>
            <p>
              Workspace:{' '}
              <span className="text-white">
                {readiness.workspace.hasOrganization &&
                readiness.workspace.hasBrand
                  ? 'ready'
                  : 'still bootstrapping'}
              </span>
            </p>
            <p>
              Local tools:{' '}
              <span className="text-white">
                {loading
                  ? 'checking...'
                  : readiness.localTools.anyDetected
                    ? readiness.localTools.detected.join(', ')
                    : 'none detected'}
              </span>
            </p>
            <p>
              Providers:{' '}
              <span className="text-white">
                {loading
                  ? 'checking...'
                  : readiness.providers.anyConfigured
                    ? readiness.providers.configured.join(', ')
                    : 'none detected'}
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/45">
            Add missing tools or keys later in{' '}
            <span className="text-white">
              Settings → Organization → API Keys
            </span>{' '}
            or by installing Claude/Codex locally. You can still continue now.
          </div>

          {readiness.ui.showCloudUpgradeCta ? (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => {
                window.location.href = EnvironmentService.apps.website;
              }}
              icon={<HiCloudArrowUp className="h-4 w-4" />}
              label="Explore Genfeed Cloud"
              className="w-full"
            />
          ) : null}

          <Button
            variant={ButtonVariant.WHITE}
            size={ButtonSize.SM}
            onClick={handleContinue}
            label={
              readiness.providers.anyConfigured
                ? 'Continue'
                : 'Continue and configure later'
            }
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

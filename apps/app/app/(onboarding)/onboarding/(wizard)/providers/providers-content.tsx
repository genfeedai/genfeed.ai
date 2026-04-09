'use client';

import { useAuth } from '@clerk/nextjs';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import type { InstallReadinessResponse } from '@services/onboarding/onboarding.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { HiArrowLeft, HiCheckCircle, HiKey, HiSparkles } from 'react-icons/hi2';

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
    router.push('/onboarding/summary');
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
        Step 2 of 3
      </div>

      <h1 className="step-headline opacity-0 mb-4 text-4xl font-serif leading-none tracking-tighter text-white md:text-5xl">
        Configure your <span className="font-light italic">providers.</span>
      </h1>

      <p className="step-description opacity-0 mb-10 max-w-2xl text-lg text-white/40">
        Check the local tools and hosted providers available on this install.
        Claude and Codex help with local agent workflows, while Replicate,
        fal.ai, and OpenAI power hosted models when you want them.
      </p>

      <div className="space-y-5">
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
                className="flex flex-col gap-3 border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0 md:flex-row md:items-start md:justify-between"
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
              Hosted providers
            </h2>
            <p className="mt-2 text-sm text-white/45">
              Connect hosted model providers if you want remote generation and
              cloud-backed workflows.
            </p>
          </div>

          <div className="space-y-3">
            {providerRows.map((provider) => (
              <div
                key={provider.key}
                className="flex flex-col gap-3 border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0 md:flex-row md:items-start md:justify-between"
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
                  {provider.enabled ? 'Configured' : 'Missing env key'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="provider-card opacity-0 flex flex-col gap-4 border border-white/[0.08] bg-white/[0.02] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="text-sm text-white/45">
            Review your install summary on the next step. You can keep going
            even if some tools or provider keys are still missing.
          </div>

          <Button
            variant={ButtonVariant.WHITE}
            size={ButtonSize.SM}
            onClick={handleContinue}
            label={loading ? 'Loading summary...' : 'Review summary'}
            disabled={loading}
            className="w-full md:w-auto"
          />
        </div>
      </div>
    </div>
  );
}

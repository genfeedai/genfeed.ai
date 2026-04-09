'use client';

import { useAuth } from '@clerk/nextjs';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import type { InstallReadinessResponse } from '@services/onboarding/onboarding.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  HiArrowLeft,
  HiArrowUpRight,
  HiCheckCircle,
  HiCloudArrowUp,
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
    selector: '.summary-card',
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

export default function SummaryContent() {
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

  return (
    <div ref={sectionRef}>
      <Button
        variant={ButtonVariant.GHOST}
        size={ButtonSize.SM}
        onClick={() => router.push('/onboarding/providers')}
        icon={<HiArrowLeft className="h-4 w-4" />}
        className="mb-8 text-white/40 hover:text-white/70"
      >
        Back
      </Button>

      <div className="step-badge opacity-0 mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
        <HiSparkles className="h-3 w-3" />
        Step 3 of 3
      </div>

      <h1 className="step-headline opacity-0 mb-4 text-4xl font-serif leading-none tracking-tighter text-white md:text-5xl">
        Finish with the setup{' '}
        <span className="font-light italic">that fits.</span>
      </h1>

      <p className="step-description opacity-0 mb-10 max-w-2xl text-lg text-white/40">
        Keep going with your current self-hosted install, or switch to Genfeed
        Cloud if you want the faster managed path.
      </p>

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.2fr]">
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
              <span className="text-white/45">Hosted providers</span>
              <span className="text-right text-white">{providersLabel}</span>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/45">
            Missing keys are fine for now. You can add them later in{' '}
            <span className="text-white">
              Settings → Organization → API Keys
            </span>
            .
          </div>

          <Button
            variant={ButtonVariant.WHITE}
            size={ButtonSize.SM}
            onClick={() => router.push('/onboarding/success')}
            label="Continue with self-hosted"
            className="mt-5 w-full"
          />
        </div>

        <div className="summary-card opacity-0 border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 md:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/80">
            <HiCloudArrowUp className="h-4 w-4" />
            Genfeed Cloud
          </div>

          <h2 className="mt-4 text-2xl font-serif tracking-tight text-white md:text-3xl">
            Don&apos;t know what you&apos;re looking for yet?
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">
            Use our cloud solution instead. You skip local model wiring, get a
            cleaner default setup, and can start generating content faster.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <HiCheckCircle className="h-4 w-4 text-emerald-300" />
                Faster start
              </div>
              <p className="mt-2 text-sm text-white/45">
                No local CLI or provider key setup before you can get value.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <HiCheckCircle className="h-4 w-4 text-emerald-300" />
                Managed stack
              </div>
              <p className="mt-2 text-sm text-white/45">
                Hosted workflows, billing, and provider orchestration are
                already in place.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row">
            <Link
              href={EnvironmentService.apps.website}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 md:w-auto"
            >
              Explore Genfeed Cloud
              <HiArrowUpRight className="h-4 w-4" />
            </Link>

            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => router.push('/onboarding/success')}
              label="Stay self-hosted"
              className="w-full md:w-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

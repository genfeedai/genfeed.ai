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
import { HiArrowLeft, HiArrowUpRight, HiSparkles } from 'react-icons/hi2';

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
      <h1 className="step-headline opacity-0 mb-4 text-4xl font-serif leading-none tracking-tighter text-white md:text-5xl">
        Finish with the setup{' '}
        <span className="font-light italic">that fits.</span>
      </h1>

      <p className="step-description opacity-0 mb-10 max-w-2xl text-lg text-white/40">
        Keep going with your current self-hosted install, or switch to Genfeed
        Cloud if you want the faster managed path.
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
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={() => router.push('/onboarding/success')}
            label="Continue with self-hosted"
            className="mt-5 w-full md:w-auto"
          />
        </div>

        <div className="summary-card opacity-0 flex flex-col gap-3 border border-white/[0.08] bg-white/[0.02] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="max-w-2xl text-sm leading-6 text-white/45">
            Don&apos;t know what you&apos;re looking for? Use our cloud solution
            instead.
          </div>

          <Link
            href={EnvironmentService.apps.website}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white md:w-auto"
          >
            Explore Genfeed Cloud
            <HiArrowUpRight className="h-4 w-4" />
          </Link>
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

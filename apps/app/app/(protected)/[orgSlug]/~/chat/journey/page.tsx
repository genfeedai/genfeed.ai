'use client';

import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
} from '@genfeedai/types';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import Link from 'next/link';
import { useEffect } from 'react';

function normalizeJourneyState(
  missions?: IOnboardingJourneyMissionState[],
): IOnboardingJourneyMissionState[] {
  const missionMap = new Map(
    (missions ?? []).map((mission) => [mission.id, mission]),
  );

  return ONBOARDING_JOURNEY_MISSIONS.map((mission) => {
    const current = missionMap.get(mission.id);
    return {
      completedAt: current?.completedAt ?? null,
      id: mission.id,
      isCompleted: current?.isCompleted ?? false,
      rewardClaimed: current?.rewardClaimed ?? false,
      rewardCredits: mission.rewardCredits,
    };
  });
}

export default function ChatJourneyPage() {
  const { isLoading, refresh, settings } = useOrganization();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const missions = normalizeJourneyState(
    settings?.onboardingJourneyMissions as
      | IOnboardingJourneyMissionState[]
      | undefined,
  );
  const completedCount = missions.filter(
    (mission) => mission.isCompleted,
  ).length;
  const earnedCredits = missions
    .filter((mission) => mission.rewardClaimed)
    .reduce((total, mission) => total + mission.rewardCredits, 0);
  const remainingJourneyCredits = Math.max(
    ONBOARDING_JOURNEY_TOTAL_CREDITS - earnedCredits,
    0,
  );
  const recommendedMissionId = missions.find(
    (mission) => !mission.isCompleted,
  )?.id;
  const completionPercent =
    missions.length > 0
      ? Math.round((completedCount / missions.length) * 100)
      : 0;

  if (isLoading) {
    return <PageLoadingState />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              Activation Journey
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">
              Complete guided missions and unlock more credits as you go
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Finish the guided missions inside GenFeed to improve generation
              quality, generate your first image early, and keep your workspace
              moving with additional credits.
            </p>
          </div>
          <Link
            href="/onboarding/providers"
            className="inline-flex rounded-full border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Back to onboarding
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Progress
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {completionPercent}%
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Available to unlock
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {remainingJourneyCredits}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Journey unlocked
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {earnedCredits}/{ONBOARDING_JOURNEY_TOTAL_CREDITS}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Journey total
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {ONBOARDING_JOURNEY_TOTAL_CREDITS}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {ONBOARDING_JOURNEY_MISSIONS.map((mission) => {
          const state = missions.find((item) => item.id === mission.id);
          const isCompleted = state?.isCompleted ?? false;
          const isRecommended = mission.id === recommendedMissionId;

          return (
            <div
              key={mission.id}
              className={`rounded-2xl border p-5 ${
                isRecommended
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {mission.label}
                    </h2>
                    <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                      +{mission.rewardCredits} credits
                    </span>
                    {isRecommended ? (
                      <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                        Recommended next
                      </span>
                    ) : null}
                    {isCompleted ? (
                      <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                        Completed
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {mission.description}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-foreground/80">
                    {mission.whyItMatters}
                  </p>
                  {isRecommended ? (
                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-primary/80">
                      {remainingJourneyCredits} journey credits still available
                    </p>
                  ) : null}
                </div>

                <Link
                  href={mission.ctaHref}
                  className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-foreground hover:bg-white/5"
                >
                  {isCompleted ? 'Review' : mission.ctaLabel}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

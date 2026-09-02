'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
} from '@genfeedai/contracts/types';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import Card from '@ui/card/Card';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <Card variant={CardVariant.DEFAULT} bodyClassName="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="sr-only">Activation Journey</h1>
          <Button
            asChild
            className="inline-flex rounded-full border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <Link href={APP_ROUTES.ONBOARDING.PROVIDERS}>
              Back to onboarding
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Progress
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {isLoading ? '-' : `${completionPercent}%`}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Available to unlock
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {isLoading ? '-' : remainingJourneyCredits}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Journey unlocked
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {isLoading
                ? '-'
                : `${earnedCredits}/${ONBOARDING_JOURNEY_TOTAL_CREDITS}`}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Journey total
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {ONBOARDING_JOURNEY_TOTAL_CREDITS}
            </p>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4" data-testid="journey-missions-loading">
          <SkeletonList count={ONBOARDING_JOURNEY_MISSIONS.length} />
        </div>
      ) : (
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
                    : 'border-border bg-background-secondary'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground">
                        {mission.label}
                      </h2>
                      <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                        +{mission.rewardCredits} credits
                      </span>
                      {isRecommended ? (
                        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                          Recommended next
                        </span>
                      ) : null}
                      {isCompleted ? (
                        <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
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
                        {remainingJourneyCredits} journey credits still
                        available
                      </p>
                    ) : null}
                  </div>

                  <Button
                    asChild
                    className="inline-flex rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-hover"
                    variant={ButtonVariant.SECONDARY}
                    withWrapper={false}
                  >
                    <Link href={mission.ctaHref}>
                      {isCompleted ? 'Review' : mission.ctaLabel}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

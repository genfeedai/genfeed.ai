'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  AgentOnboardingChecklistProps,
  OnboardingBrandContextPanel,
  OnboardingBrandContextRowStatus,
  OnboardingChecklistStatus,
} from '@genfeedai/props/ui/agent/agent-onboarding.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import Spinner from '@ui/primitives/spinner';
import { Check } from 'lucide-react';
import Link from 'next/link';

function StatusIcon({ status }: { status: OnboardingChecklistStatus }) {
  if (status === 'complete') {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-3.5" />
      </div>
    );
  }

  if (status === 'in-progress') {
    return (
      <div className="flex size-6 items-center justify-center">
        <Spinner className="size-4 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex size-6 items-center justify-center">
      <div className="size-3 rounded-full border-2 border-foreground/20" />
    </div>
  );
}

function BrandContextRowIcon({
  status,
}: {
  status: OnboardingBrandContextRowStatus;
}) {
  if (status === 'done') {
    return (
      <div className="flex size-5 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-3" />
      </div>
    );
  }

  return (
    <div className="flex size-5 items-center justify-center">
      <div
        className={cn(
          'size-3 rounded-full border-2',
          status === 'now' ? 'border-primary' : 'border-foreground/20',
        )}
      />
    </div>
  );
}

function resolveScoreHint(score: number): string {
  if (score >= 70) return 'Strong: outputs will sound like you';
  if (score > 0) return 'Each answer makes outputs more specific';
  return 'Starts with your website';
}

function BrandContextChecklist({
  brandContext,
  isCreditRewardsVisible,
}: {
  brandContext: OnboardingBrandContextPanel;
  isCreditRewardsVisible: boolean;
}) {
  const score = brandContext.score ?? 0;

  return (
    <div className="flex h-full flex-col bg-background/50">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Brand context
          </h2>
          <span
            className="text-sm font-semibold text-foreground"
            data-testid="onboarding-brand-context-score"
          >
            {brandContext.score === null ? '–' : `${score}%`}
          </span>
        </div>
        <div
          aria-label="Brand context"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={score}
          className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/8"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {resolveScoreHint(score)}
        </p>
        {isCreditRewardsVisible ? (
          <div className="mt-3 flex items-center justify-between text-2xs text-muted-foreground">
            <span>Credits earned</span>
            <span className="font-medium text-foreground">
              +{brandContext.creditsEarned}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {brandContext.rows.map((row) => (
            <li
              key={row.id}
              className={cn(
                'flex items-center gap-3 px-2 py-2',
                row.status === 'now' && 'bg-foreground/[0.04]',
              )}
              data-status={row.status}
            >
              <BrandContextRowIcon status={row.status} />
              <span
                className={cn(
                  'flex-1 text-sm',
                  row.status === 'todo' || row.status === 'skipped'
                    ? 'text-muted-foreground'
                    : 'text-foreground',
                )}
              >
                {row.label}
                {row.status === 'skipped' ? ' (skipped)' : ''}
              </span>
              {isCreditRewardsVisible && row.rewardCredits ? (
                <span
                  className={cn(
                    'shrink-0 text-2xs font-medium',
                    row.isRewardEarned
                      ? 'text-success'
                      : 'text-muted-foreground',
                  )}
                >
                  +{row.rewardCredits}
                  {row.isRewardEarned ? ' earned' : ''}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 px-2 text-2xs leading-relaxed text-muted-foreground">
          Every answer is saved to your brand and used in every post, image and
          video.
        </p>
      </div>
    </div>
  );
}

export function AgentOnboardingChecklist({
  brandContext,
  steps,
  currentStepId,
  earnedCredits = 0,
  totalJourneyCredits = 100,
  signupGiftCredits = 0,
  totalOnboardingCreditsVisible,
  completionPercent,
  journeyHref = APP_ROUTES.AGENT.JOURNEY,
  isCreditRewardsVisible = true,
}: AgentOnboardingChecklistProps) {
  const resolvedPercent =
    completionPercent ??
    (steps.length > 0
      ? Math.round(
          (steps.filter((s) => s.status === 'complete').length / steps.length) *
            100,
        )
      : 0);
  const resolvedTotalVisibleCredits =
    totalOnboardingCreditsVisible ?? signupGiftCredits + totalJourneyCredits;

  if (brandContext) {
    return (
      <BrandContextChecklist
        brandContext={brandContext}
        isCreditRewardsVisible={isCreditRewardsVisible}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-background/50">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Activation Journey
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {steps.filter((s) => s.status === 'complete').length} of{' '}
              {steps.length} complete
            </p>
          </div>
          <Link
            href={journeyHref}
            className="text-2xs font-medium text-primary hover:underline"
          >
            Open journey
          </Link>
        </div>

        <div className="mt-3 border border-border/60 bg-background/80 p-3">
          {isCreditRewardsVisible ? (
            <div className="space-y-2 text-2xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Signup gift</span>
                <span className="font-medium text-foreground">
                  {signupGiftCredits}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Journey unlocked</span>
                <span className="font-medium text-foreground">
                  {earnedCredits}/{totalJourneyCredits}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total visible</span>
                <span className="font-medium text-foreground">
                  {resolvedTotalVisibleCredits}
                </span>
              </div>
            </div>
          ) : null}
          <div
            className={cn(
              'h-2 overflow-hidden rounded-full bg-foreground/8',
              isCreditRewardsVisible && 'mt-2',
            )}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${resolvedPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'flex items-start gap-3 p-3 transition-colors',
                step.id === currentStepId && 'bg-foreground/[0.04]',
                step.status === 'complete' && 'opacity-60',
              )}
            >
              <div className="flex flex-col items-center">
                <StatusIcon status={step.status} />
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'mt-1 w-px flex-1 min-h-[16px]',
                      step.status === 'complete'
                        ? 'bg-success/30'
                        : 'bg-foreground/10',
                    )}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      step.status === 'complete'
                        ? 'text-foreground/60 line-through'
                        : 'text-foreground',
                    )}
                  >
                    {step.title}
                  </p>
                  {isCreditRewardsVisible ? (
                    <span className="shrink-0 text-2xs font-medium text-warning">
                      +{step.rewardCredits ?? 0}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
                {step.status !== 'complete' && step.ctaHref ? (
                  <Link
                    href={step.ctaHref}
                    className="mt-2 inline-flex text-2xs font-medium text-primary hover:underline"
                  >
                    {step.ctaLabel ?? 'Start'}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

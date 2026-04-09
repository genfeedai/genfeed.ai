'use client';

import type {
  AgentOnboardingChecklistProps,
  OnboardingChecklistStatus,
} from '@genfeedai/props/ui/agent/agent-onboarding.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import Link from 'next/link';
import { HiCheck } from 'react-icons/hi2';

function StatusIcon({ status }: { status: OnboardingChecklistStatus }) {
  if (status === 'complete') {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20 text-green-400">
        <HiCheck className="h-3.5 w-3.5" />
      </div>
    );
  }

  if (status === 'in-progress') {
    return (
      <div className="flex h-6 w-6 items-center justify-center">
        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-6 w-6 items-center justify-center">
      <div className="h-3 w-3 rounded-full border-2 border-white/20" />
    </div>
  );
}

export function AgentOnboardingChecklist({
  steps,
  currentStepId,
  earnedCredits = 0,
  totalJourneyCredits = 100,
  signupGiftCredits = 0,
  totalOnboardingCreditsVisible,
  completionPercent,
  journeyHref = '/chat/journey',
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
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Open journey
          </Link>
        </div>

        <div className="mt-3 border border-border/60 bg-background/80 p-3">
          <div className="space-y-2 text-[11px] text-muted-foreground">
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
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${resolvedPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-1">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'flex items-start gap-3 px-3 py-3 transition-colors',
                step.id === currentStepId && 'bg-white/[0.04]',
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
                        ? 'bg-green-500/30'
                        : 'bg-white/10',
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
                        ? 'text-white/60 line-through'
                        : 'text-foreground',
                    )}
                  >
                    {step.title}
                  </p>
                  <span className="shrink-0 text-[11px] font-medium text-amber-300">
                    +{step.rewardCredits ?? 0}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
                {step.status !== 'complete' && step.ctaHref ? (
                  <Link
                    href={step.ctaHref}
                    className="mt-2 inline-flex text-[11px] font-medium text-primary hover:underline"
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

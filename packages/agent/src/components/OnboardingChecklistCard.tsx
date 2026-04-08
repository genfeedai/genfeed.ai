import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import { HiCheckCircle, HiChevronRight, HiRocketLaunch } from 'react-icons/hi2';

interface OnboardingChecklistCardProps {
  action: AgentUiAction;
}

export function OnboardingChecklistCard({
  action,
}: OnboardingChecklistCardProps): ReactElement {
  const items = action.checklist ?? [];
  const completedCount = items.filter((item) => item.isCompleted).length;
  const totalCount = items.length;
  const progressPercent =
    action.completionPercent ??
    (totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);
  const signupGiftCredits = action.signupGiftCredits ?? 0;
  const journeyEarnedCredits =
    action.journeyEarnedCredits ?? action.earnedCredits ?? 0;
  const totalVisibleCredits =
    action.totalOnboardingCreditsVisible ??
    signupGiftCredits + (action.totalJourneyCredits ?? 100);

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiRocketLaunch className="h-5 w-5 text-violet-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Getting Started'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      <div className="mb-3 border border-border bg-muted/40 p-2.5">
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Signup gift</span>
            <span className="font-semibold text-foreground">
              {signupGiftCredits}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Journey unlocked</span>
            <span className="font-semibold text-foreground">
              {journeyEarnedCredits}/{action.totalJourneyCredits ?? 100}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Total visible</span>
            <span className="font-semibold text-foreground">
              {totalVisibleCredits}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {completedCount} of {totalCount} completed
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-2 ${
              item.isCompleted ? 'bg-muted/50' : 'bg-muted'
            }`}
          >
            <div className="flex items-center gap-2">
              <HiCheckCircle
                className={`h-4 w-4 shrink-0 ${
                  item.isCompleted
                    ? 'text-green-500'
                    : 'text-muted-foreground/40'
                }`}
              />
              <span
                className={`text-xs ${
                  item.isCompleted
                    ? 'text-muted-foreground line-through'
                    : 'font-medium text-foreground'
                }`}
              >
                {item.label}
              </span>
              <span className="text-[10px] font-medium text-amber-300">
                +{item.rewardCredits ?? 0}
              </span>
            </div>
            {!item.isCompleted && item.ctaHref && (
              <a
                href={item.ctaHref}
                className="flex items-center gap-0.5 text-[10px] font-medium text-primary hover:underline"
              >
                {item.ctaLabel || 'Start'}
                <HiChevronRight className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
      </div>

      {completedCount === totalCount && totalCount > 0 && (
        <div className="mt-3 bg-violet-50 p-2 text-center text-xs font-medium text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
          All done! You are ready to go.
        </div>
      )}
    </div>
  );
}

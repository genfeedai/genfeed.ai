'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useStreak } from '@genfeedai/hooks/data/streaks/use-streak/use-streak';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useSetupCard } from '@genfeedai/hooks/utils/use-setup-card/use-setup-card';
import { useSidebarProgressCollapsedPreference } from '@genfeedai/hooks/utils/use-sidebar-progress-collapsed-preference/use-sidebar-progress-collapsed-preference';
import { useSidebarProgressPreference } from '@genfeedai/hooks/utils/use-sidebar-progress-preference/use-sidebar-progress-preference';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { SCROLL_FOCUS_OUTER_SHADOW } from '@ui/styles/scroll-focus';
import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import {
  HiChevronDown,
  HiMiniArrowUpRight,
  HiMiniCheckCircle,
  HiMiniSparkles,
  HiXMark,
} from 'react-icons/hi2';

const COLLAPSED_STORAGE_KEY = 'genfeed:sidebar:progress-collapsed';

export default function ProgressSidebarCard() {
  const { completedCount, steps, totalCount } = useSetupCard();
  const { orgHref } = useOrgUrl();
  const { hideProgress, isSaving, isVisible } = useSidebarProgressPreference();
  const {
    hasPersistedPreference,
    isCollapsed,
    isSaving: isSavingCollapsedPreference,
    setCollapsed,
  } = useSidebarProgressCollapsedPreference();
  const {
    isLoading,
    isVisible: hasStreakContext,
    streak,
  } = useStreak({
    includeCalendar: false,
  });
  const hasMigratedLegacyPreference = useRef(false);

  const currentStreak = streak?.currentStreak ?? 0;
  const streakFreezes = streak?.streakFreezes ?? 0;
  const nextMilestone = streak?.nextMilestone ?? null;
  const nextSetupStep = steps.find((step) => !step.isCompleted) ?? null;
  const allSetupComplete = completedCount === totalCount;

  const handleToggle = useCallback(() => {
    void setCollapsed(!isCollapsed);
  }, [isCollapsed, setCollapsed]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !hasPersistedPreference ||
      !hasMigratedLegacyPreference.current
    ) {
      return;
    }

    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(isCollapsed));
  }, [hasPersistedPreference, isCollapsed]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      hasPersistedPreference ||
      hasMigratedLegacyPreference.current
    ) {
      return;
    }

    const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);

    if (stored === null) {
      hasMigratedLegacyPreference.current = true;
      return;
    }

    hasMigratedLegacyPreference.current = true;

    if (stored === String(isCollapsed)) {
      return;
    }

    void setCollapsed(stored === 'true');
  }, [hasPersistedPreference, isCollapsed, setCollapsed]);

  if (!isVisible) {
    return null;
  }

  return (
    <Card
      variant={CardVariant.DEFAULT}
      className={cn(
        'gen-shell-panel mx-3 mb-3 rounded-[1.4rem] border-white/[0.06] bg-transparent shadow-[0_18px_50px_-32px_rgba(0,0,0,0.88)] hover:border-white/[0.08]',
        SCROLL_FOCUS_OUTER_SHADOW,
      )}
      bodyClassName="gap-0 p-0 sm:p-0"
      data-testid="progress-sidebar-card"
    >
      <div className="flex items-start gap-2 px-3 py-3">
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={handleToggle}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={!isCollapsed}
          aria-controls="sidebar-progress-panel"
          isDisabled={isSavingCollapsedPreference}
        >
          <div className="gen-shell-surface mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border-orange-400/20 bg-orange-400/10 text-orange-200">
            <HiMiniSparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/36">
                Progress
              </p>
              <span className="gen-shell-chip px-1.5 py-0.5 text-[10px] font-medium text-foreground/42">
                {completedCount}/{totalCount}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold tracking-[-0.02em] text-foreground">
              {completedCount}/{totalCount} setup
              <span className="mx-2 text-foreground/22">·</span>
              {isLoading ? 'Loading streak...' : `${currentStreak}d streak`}
            </p>
            <p className="mt-1 text-xs text-foreground/46">
              {nextSetupStep
                ? `${nextSetupStep.label} next`
                : hasStreakContext && nextMilestone
                  ? `${nextMilestone.remaining}d to ${nextMilestone.days}`
                  : 'Setup and streak'}
            </p>
          </div>
          <HiChevronDown
            className={cn(
              'mt-1 h-4 w-4 flex-shrink-0 text-white/35 transition-transform duration-200',
              isCollapsed && '-rotate-90',
            )}
          />
        </Button>

        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={() => void hideProgress()}
          className="gen-shell-control mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-foreground/42"
          ariaLabel="Hide progress"
          isDisabled={isSaving}
          icon={<HiXMark className="h-4 w-4" />}
        />
      </div>

      <div
        id="sidebar-progress-panel"
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/[0.05] px-3 pb-3 pt-2">
            <section className="py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground/88">
                    Complete setup
                  </p>
                  <p className="mt-0.5 text-[11px] text-foreground/45">
                    {allSetupComplete
                      ? 'Setup complete.'
                      : nextSetupStep
                        ? `${nextSetupStep.label} next.`
                        : 'Refine defaults.'}
                  </p>
                </div>
                {allSetupComplete ? (
                  <span
                    className="gen-shell-chip inline-flex flex-shrink-0 items-center gap-1 px-2 py-1 text-[10px] font-semibold"
                    data-tone="success"
                  >
                    <HiMiniCheckCircle className="h-3.5 w-3.5" />
                    Ready
                  </span>
                ) : null}
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(251,146,60,0.95),rgba(217,119,6,0.7))] transition-[width] duration-500 ease-out"
                  style={{
                    width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
                  }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                {nextSetupStep ? (
                  <Link
                    href={nextSetupStep.href}
                    className="gen-shell-control inline-flex min-w-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-foreground/78"
                  >
                    <span className="truncate">Finish setup</span>
                    <HiMiniArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
                  </Link>
                ) : (
                  <span className="text-[11px] text-foreground/45">
                    All done
                  </span>
                )}

                <Link
                  href={orgHref('/settings/personal')}
                  className="text-[11px] font-medium text-foreground/55 transition-colors hover:text-foreground"
                >
                  View all
                </Link>
              </div>
            </section>

            <section className="border-t border-white/[0.05] py-3">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground/82">
                    Daily streak
                  </p>
                  <p className="mt-0.5 text-[11px] text-foreground/45">
                    {isLoading
                      ? 'Loading streak...'
                      : nextMilestone
                        ? `${nextMilestone.remaining}d to ${nextMilestone.days}`
                        : `${currentStreak}d active`}
                  </p>
                </div>

                <div className="flex items-baseline gap-5">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-foreground">
                      {isLoading ? '...' : currentStreak}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground/35">
                      streak
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-semibold text-foreground">
                      {isLoading ? '...' : streakFreezes}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground/35">
                      freeze{streakFreezes === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Card>
  );
}

'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { useStreak } from '@hooks/data/streaks/use-streak/use-streak';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { STREAK_CELEBRATION_EVENT } from '@services/engagement/streak-events';
import StreakCelebrationBurst from '@ui/feedback/streak-celebration/StreakCelebrationBurst';
import Link from 'next/link';
import { useEffect, useState } from 'react';

function formatDayKey(offsetFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetFromToday);
  return date.toISOString().slice(0, 10);
}

export default function StreakCard() {
  const { streak, calendar, isLoading, isVisible } = useStreak();
  const { orgHref } = useOrgUrl();
  const [isCelebrating, setIsCelebrating] = useState(false);

  useEffect(() => {
    const handleCelebration = () => {
      setIsCelebrating(true);
      window.setTimeout(() => setIsCelebrating(false), 1400);
    };

    window.addEventListener(
      STREAK_CELEBRATION_EVENT,
      handleCelebration as EventListener,
    );
    return () =>
      window.removeEventListener(
        STREAK_CELEBRATION_EVENT,
        handleCelebration as EventListener,
      );
  }, []);

  if (!isVisible) {
    return null;
  }

  const currentStreak = streak?.currentStreak ?? 0;
  const nextMilestone = streak?.nextMilestone ?? null;
  const streakFreezes = streak?.streakFreezes ?? 0;
  const lastSevenDays = Array.from({ length: 7 }, (_, index) =>
    formatDayKey(index - 6),
  );

  return (
    <div className="relative mx-3 mb-3 border border-orange-500/15 bg-orange-500/[0.06] p-3">
      <StreakCelebrationBurst isVisible={isCelebrating} />
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-200/70">
            Daily streak
          </p>
          <p className="text-lg font-semibold text-white">
            {isLoading
              ? '...'
              : `${currentStreak} day${currentStreak === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="rounded-full border border-orange-400/20 px-2 py-1 text-[11px] font-medium text-orange-100/80">
          {streakFreezes} freeze{streakFreezes === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-7 gap-1">
        {lastSevenDays.map((dayKey) => {
          const count = calendar[dayKey]?.count ?? 0;
          return (
            <div
              key={dayKey}
              className={cn(
                'h-7 rounded border text-[10px] flex items-center justify-center',
                count > 0
                  ? 'border-orange-300/30 bg-orange-300/25 text-orange-50'
                  : 'border-white/8 bg-white/[0.03] text-white/25',
              )}
              title={`${dayKey}${count > 0 ? `: ${count} item${count === 1 ? '' : 's'}` : ''}`}
            >
              {dayKey.slice(8, 10)}
            </div>
          );
        })}
      </div>

      <p className="mb-3 text-[12px] leading-5 text-white/65">
        {nextMilestone
          ? `Next milestone: ${nextMilestone.days} days. ${nextMilestone.remaining} more day${nextMilestone.remaining === 1 ? '' : 's'} to go.`
          : 'Top streak milestone reached. Keep creating daily to defend it.'}
      </p>

      <Link
        href={orgHref('/settings/personal')}
        className="flex items-center justify-between border border-white/8 bg-white/[0.04] px-2.5 py-2 text-[12px] text-white/80 transition-colors duration-150 hover:bg-white/[0.06]"
      >
        <span>
          {currentStreak > 0 ? 'Open streak view' : 'Start your streak today'}
        </span>
        <span className="text-white/40">View</span>
      </Link>
    </div>
  );
}

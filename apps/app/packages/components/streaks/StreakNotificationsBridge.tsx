'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IStreakSummary } from '@genfeedai/types';
import { useStreak } from '@hooks/data/streaks/use-streak/use-streak';
import { NotificationsService } from '@services/core/notifications.service';
import {
  STREAK_CELEBRATION_EVENT,
  type StreakCelebrationDetail,
} from '@services/engagement/streak-events';
import { useEffect } from 'react';

const STORAGE_KEY = 'genfeed:streak-announcements:v1';

interface StreakAnnouncementState {
  brokenKey?: string;
  freezeKey?: string;
  milestoneKey?: string;
  riskKey?: string;
}

function readState(scopeKey: string): StreakAnnouncementState {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const allState = JSON.parse(raw) as Record<string, StreakAnnouncementState>;
    return allState[scopeKey] ?? {};
  } catch {
    return {};
  }
}

function writeState(
  scopeKey: string,
  nextState: StreakAnnouncementState,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const allState = raw
      ? (JSON.parse(raw) as Record<string, StreakAnnouncementState>)
      : {};
    allState[scopeKey] = nextState;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allState));
  } catch {
    // noop
  }
}

function buildMilestoneToast(milestone: number, rewardCredits: number): string {
  if (milestone === 7) {
    return 'You hit a 7-day streak. Freeze unlocked.';
  }

  if (rewardCredits > 0) {
    return `You hit ${milestone} days. ${rewardCredits} credits added.`;
  }

  return `You hit a ${milestone}-day streak.`;
}

interface StreakNotificationsBridgeProps {
  initialStreak?: IStreakSummary | null;
}

export default function StreakNotificationsBridge({
  initialStreak = null,
}: StreakNotificationsBridgeProps) {
  const { organizationId } = useBrand();
  const { streak } = useStreak({
    includeCalendar: false,
    initialStreak,
  });

  useEffect(() => {
    if (!organizationId || !streak) {
      return;
    }

    const notifications = NotificationsService.getInstance();
    const scopeKey = streak.id || organizationId;
    const state = readState(scopeKey);
    const nextState = { ...state };

    const latestMilestone = [...(streak.milestoneStates ?? [])]
      .filter((item) => item.isAchieved && item.achievedAt)
      .sort(
        (left, right) =>
          new Date(right.achievedAt ?? 0).getTime() -
          new Date(left.achievedAt ?? 0).getTime(),
      )[0];

    if (latestMilestone?.achievedAt) {
      const milestoneKey = `${latestMilestone.days}:${new Date(
        latestMilestone.achievedAt,
      ).toISOString()}`;

      if (state.milestoneKey !== milestoneKey) {
        notifications.success(
          buildMilestoneToast(
            latestMilestone.days,
            latestMilestone.rewardCredits,
          ),
        );
        window.dispatchEvent(
          new CustomEvent<StreakCelebrationDetail>(STREAK_CELEBRATION_EVENT, {
            detail: { milestone: latestMilestone.days },
          }),
        );
        nextState.milestoneKey = milestoneKey;
      }
    }

    if (streak.status === 'at_risk' && streak.lastActivityDate) {
      const riskKey = new Date(streak.lastActivityDate).toISOString();
      if (state.riskKey !== riskKey) {
        notifications.warning(
          'Your streak is at risk today. Create one piece to keep it alive.',
        );
        nextState.riskKey = riskKey;
      }
    }

    if (streak.lastFreezeUsedAt) {
      const freezeKey = new Date(streak.lastFreezeUsedAt).toISOString();
      if (state.freezeKey !== freezeKey) {
        notifications.success('A streak freeze protected your streak.');
        nextState.freezeKey = freezeKey;
      }
    }

    if (streak.status === 'broken_recently' && streak.lastBrokenAt) {
      const brokenKey = `${new Date(streak.lastBrokenAt).toISOString()}:${streak.lastBrokenStreak ?? 0}`;
      if (state.brokenKey !== brokenKey) {
        notifications.warning(
          `Your ${streak.lastBrokenStreak ?? 0}-day streak ended. Start a new one today.`,
        );
        nextState.brokenKey = brokenKey;
      }
    }

    writeState(scopeKey, nextState);
  }, [organizationId, streak]);

  return null;
}

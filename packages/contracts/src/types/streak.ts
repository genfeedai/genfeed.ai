export interface IStreakMilestoneDefinition {
  days: number;
  rewardCredits: number;
  rewardLabel: string;
}

export interface IStreakMilestoneState extends IStreakMilestoneDefinition {
  achievedAt?: string | Date | null;
  isAchieved: boolean;
  isNext: boolean;
}

export type StreakStatus = 'idle' | 'active' | 'at_risk' | 'broken_recently';

export interface IStreakMilestoneHistoryItem {
  milestone: number;
  achievedAt: string | Date;
  reward: string;
}

export interface IStreak {
  id: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: string | Date | null;
  lastBrokenAt?: string | Date | null;
  lastBrokenStreak?: number | null;
  lastFreezeUsedAt?: string | Date | null;
  streakStartDate?: string | Date | null;
  streakFreezes: number;
  totalContentDays: number;
  milestones: number[];
  milestoneHistory: IStreakMilestoneHistoryItem[];
}

export interface IStreakSummary extends IStreak {
  badgeMilestones: number[];
  milestoneStates: IStreakMilestoneState[];
  nextMilestone: {
    days: number;
    remaining: number;
    rewardCredits: number;
  } | null;
  status: StreakStatus;
}

export interface IStreakCalendarDay {
  count: number;
  types: string[];
}

export interface IStreakCalendarResponse {
  days: Record<string, IStreakCalendarDay>;
}

export const STREAK_MILESTONES: IStreakMilestoneDefinition[] = [
  {
    days: 3,
    rewardCredits: 0,
    rewardLabel: 'Milestone reached',
  },
  {
    days: 7,
    rewardCredits: 0,
    rewardLabel: 'Streak freeze unlocked',
  },
  {
    days: 30,
    rewardCredits: 50,
    rewardLabel: '30-day badge + 50 credits',
  },
  {
    days: 100,
    rewardCredits: 200,
    rewardLabel: '100-day badge + 200 credits',
  },
  {
    days: 365,
    rewardCredits: 1000,
    rewardLabel: '365-day badge + 1000 credits',
  },
];

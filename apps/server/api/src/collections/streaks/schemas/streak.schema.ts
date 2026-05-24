import type { Streak as PrismaStreak } from '@genfeedai/prisma';

export interface StreakMilestoneHistoryEntry {
  achievedAt: Date | string;
  milestone: number;
  reward: string;
  [key: string]: unknown;
}

export interface StreakDocument extends Omit<PrismaStreak, 'data'> {
  _id: string;
  organization?: string;
  user?: string;
  currentStreak: number;
  lastActivityDate?: Date | string | null;
  lastBrokenAt?: Date | string | null;
  lastBrokenStreak?: number | null;
  lastFreezeUsedAt?: Date | string | null;
  longestStreak: number;
  milestoneHistory?: StreakMilestoneHistoryEntry[];
  milestones?: number[];
  streakFreezes: number;
  streakStartDate?: Date | string | null;
  totalContentDays: number;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

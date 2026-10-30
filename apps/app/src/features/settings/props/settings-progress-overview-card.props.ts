import type { SetupCardStep } from '@hooks/utils/use-setup-card/use-setup-card';

export type NextMilestone = {
  days: number;
  remaining: number;
  rewardCredits: number;
} | null;

export type Props = {
  completedCount: number;
  totalCount: number;
  isLoading: boolean;
  currentStreak: number;
  longestStreak: number;
  nextMilestone: NextMilestone;
  nextSetupStep: SetupCardStep | null;
  orgHref: (href: string) => string;
};

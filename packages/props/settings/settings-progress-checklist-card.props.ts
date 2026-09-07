import type { SetupCardStep } from '@hooks/utils/use-setup-card/use-setup-card';

export type Props = {
  completedCount: number;
  totalCount: number;
  steps: SetupCardStep[];
};

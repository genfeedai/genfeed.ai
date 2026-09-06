import type { IViralHookAnalysis } from '@genfeedai/contracts/interfaces/analytics/viral-hooks.interface';

export type Props = {
  analysisData: IViralHookAnalysis;
  formatTimeSpent: (seconds: number) => string;
  isLoading?: boolean;
};

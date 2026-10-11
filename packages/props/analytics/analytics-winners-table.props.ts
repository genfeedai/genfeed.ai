import type { IWinnerPost } from '@genfeedai/contracts/interfaces';

export interface AnalyticsWinnersTableProps {
  winners: IWinnerPost[];
  search: string;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onSelectPost: (postId: string) => void;
}

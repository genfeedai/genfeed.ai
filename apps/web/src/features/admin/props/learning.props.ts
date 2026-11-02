import type { LearningPromptSlotOutcomeReport } from '@genfeedai/contracts/interfaces';

export interface UseLearningReportOptions {
  /** The brand to narrow to; empty reads the whole organization. */
  brandId?: string;
  /** Skips the request while the report is not on screen. */
  isEnabled?: boolean;
  /** The organization whose published media posts are read. */
  organizationId: string;
}

export interface LearningReportPanelProps {
  hasOrganization: boolean;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  report: LearningPromptSlotOutcomeReport | undefined;
}

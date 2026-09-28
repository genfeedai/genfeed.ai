export interface AgentDetailNeedsYouProps {
  title: string;
  /** Consecutive run failures reported on the strategy record itself. */
  failureCount: number;
  failuresDescription: string;
  viewRunsLabel: string;
  runsHref: string;
  /** Posts this agent generated that are still awaiting review. */
  pendingReviewCount: number;
  pendingReviewDescription: string;
  reviewLabel: string;
  reviewHref: string;
  className?: string;
}

export interface AgentDetailNeedsYouItem {
  id: string;
  description: string;
  actionLabel: string;
  href: string;
}

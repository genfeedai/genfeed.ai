import type { ContentLearningService } from '@genfeedai/services/analytics/content-learning.service';

export interface AgentLearningTabProps {
  brandId: string;
}

export interface AgentLearningStatusProps extends AgentLearningTabProps {
  getService: () => Promise<ContentLearningService>;
  isCurrent: () => boolean;
}

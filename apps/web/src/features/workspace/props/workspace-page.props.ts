import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import type { PlatformTimeSeriesDataPoint } from '@/props/analytics/charts.props';
import type {
  ReviewInboxSummary,
  WorkspaceSection,
} from '@/props/workspace/workspace-task.props';

export interface WorkspacePageContentProps {
  initialAnalytics?: Partial<IAnalytics>;
  initialReviewInbox?: ReviewInboxSummary;
  initialTimeSeriesData?: PlatformTimeSeriesDataPoint[];
  section?: WorkspaceSection;
}

export type UseWorkspacePageContentParams = WorkspacePageContentProps;

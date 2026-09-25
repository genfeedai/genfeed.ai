import type {
  ICredential,
  IReleaseGroup,
  IWorkflowExecution,
} from '@genfeedai/contracts/interfaces';
import type { OverviewBootstrapPayload } from '@services/auth/auth.service';

export interface OperationalHomeSectionsProps {
  brandSlug?: string;
  orgSlug: string;
}

export type ReviewInboxItem =
  OverviewBootstrapPayload['reviewInbox']['recentItems'][number];

export type NeedsYouItem =
  | { credential: ICredential; key: string; type: 'credential' }
  | { execution: IWorkflowExecution; key: string; type: 'failed' }
  | { item: ReviewInboxItem; key: string; type: 'review' };

export interface PublishingSurfaceProps {
  brandId?: string;
  brandSlug?: string;
  publications: IReleaseGroup[];
  isError: boolean;
  isLoading: boolean;
  onRetry: () => Promise<void>;
  orgSlug: string;
}

import type {
  ICredential,
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

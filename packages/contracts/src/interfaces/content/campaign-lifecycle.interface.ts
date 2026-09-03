import type {
  ContentCampaignItemKind,
  ContentCampaignItemOutcomeStatus,
  ContentCampaignLifecycleAction,
  TargetExecutionState,
} from '../..';
import type { ICampaign } from './campaign.interface';

/**
 * One post or release outcome from a Campaign membership or lifecycle
 * mutation. Independent items never roll back a sibling success.
 */
export interface ICampaignLifecycleItemOutcome {
  executionState?: TargetExecutionState;
  id: string;
  kind: ContentCampaignItemKind;
  reason?: string;
  retryable: boolean;
  status: ContentCampaignItemOutcomeStatus;
}

/**
 * Coordinated Campaign mutation result. The campaign row is the program
 * status; each item remains the canonical execution state.
 */
export interface ICampaignLifecycleResult {
  action: ContentCampaignLifecycleAction;
  campaign: ICampaign;
  id: string;
  items: ICampaignLifecycleItemOutcome[];
}

/**
 * Optional generate payload. Omit credentials to fan out to every connected
 * account on the campaign brand. Public mutations take arrays.
 */
export interface IGenerateCampaignContentInput {
  contentRunId?: string;
  credentialIds?: string[];
  idempotencyKey?: string;
  source?: string;
  workflowExecutionId?: string;
}

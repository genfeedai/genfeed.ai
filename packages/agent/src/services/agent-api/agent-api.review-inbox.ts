import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IReviewInboxDecisionResult,
  ReviewInboxDecision,
} from '@genfeedai/contracts/interfaces';

/**
 * Approves or rejects one review inbox item (#7340). The API resolves it
 * through the service that owns its gate, which fences the transition so a
 * repeated decision fails instead of landing twice.
 */
export async function resolveReviewInboxItem(
  api: AgentBaseApiService,
  itemId: string,
  decision: ReviewInboxDecision,
  signal?: AbortSignal,
): Promise<IReviewInboxDecisionResult> {
  return api.fetchResource<IReviewInboxDecisionResult>(
    `${api.config.baseUrl}${API_ENDPOINTS.REVIEW_INBOX}/decisions`,
    {
      body: JSON.stringify({ decision, itemId }),
      headers: await api.headers(),
      method: 'POST',
      signal,
    },
    decision === 'approve'
      ? 'Could not approve this review item.'
      : 'Could not reject this review item.',
    'Invalid review decision response.',
  );
}

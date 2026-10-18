import type { ApprovedGenerationQuoteConstraint } from '@api/helpers/utils/credits/generation-credit-cost.util';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

/**
 * What a trusted proactive turn may do with a text post. `draft-only` keeps it
 * in review; `publish-gate` lets `evaluateAgentPublishPolicy` decide, because
 * the agent opted into earned auto-publish.
 */
export type ProactiveTextPostGrant = 'draft-only' | 'publish-gate';

export type AgentMutationAuthorization =
  | {
      kind: 'execute';
      approvalId?: string;
      /** A reviewer redeemed the approval: run as the recorded requester. */
      executeAsUserId?: string;
      /**
       * The reviewer who redeemed it, set only when they were verified live as an
       * active member of the organization. Schedules the run saves bind to them.
       */
      approvedByUserId?: string;
      constraint?: 'proactive-text-draft-only';
      approvedGenerationQuote?: ApprovedGenerationQuoteConstraint | null;
    }
  | { kind: 'return'; result: AgentToolResult };

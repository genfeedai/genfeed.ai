import type { ApprovedGenerationQuoteConstraint } from '@api/helpers/utils/credits/generation-credit-cost.util';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

export type AgentMutationAuthorization =
  | {
      kind: 'execute';
      approvalId?: string;
      /** A reviewer redeemed the approval: run as the recorded requester. */
      executeAsUserId?: string;
      constraint?: 'proactive-text-draft-only';
      approvedGenerationQuote?: ApprovedGenerationQuoteConstraint | null;
    }
  | { kind: 'return'; result: AgentToolResult };

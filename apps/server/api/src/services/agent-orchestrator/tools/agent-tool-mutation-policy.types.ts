import type { ApprovedGenerationQuoteConstraint } from '@api/helpers/utils/credits/generation-credit-cost.util';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

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

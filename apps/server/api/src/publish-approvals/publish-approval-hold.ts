import type { Prisma } from '@genfeedai/prisma';

/**
 * Veto a publish approval can consult before it is minted or claimed. A veto
 * throws; nothing here decides what a post says, only whether it may go out.
 */
export interface IPublishApprovalHold {
  assertPostPublishable(input: {
    organizationId: string;
    postId: string;
    /** True only for an approval an interactive member made in the app. */
    isHumanApproval: boolean;
    /** True for an unattended workflow or MCP publish the brand Policy binds. */
    isPolicyBound: boolean;
    /** The transaction the approval is written in, when there is one. */
    transaction?: Prisma.TransactionClient;
  }): Promise<void>;
}

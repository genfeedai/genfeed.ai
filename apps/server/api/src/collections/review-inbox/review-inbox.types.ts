import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';

export interface ReviewInboxListInput {
  organizationId: string;
  /** The selected brand; omitted at organization scope (every brand). */
  brandId?: string | null;
}

export interface ReviewInboxViewerAccess {
  /** Owner, admin or creator: may approve or reject workflow review gates. */
  canResolveWorkflowGates: boolean;
  /** Owner or admin: sees and resolves MCP approvals. */
  canResolveMcpApprovals: boolean;
  /** Brands a brand-restricted member may see; undefined means every brand. */
  brandIds?: string[];
  /**
   * Who is looking, for the sources whose visibility is personal (agent
   * threads: the owner and live shares). Absent for callers with no member
   * behind them, such as a platform override: they see none of those rows.
   */
  actor?: BrandAccessActor;
}

export interface ReviewInboxMemberInput {
  organizationId: string;
  userId: string;
  brandId?: string | null;
}

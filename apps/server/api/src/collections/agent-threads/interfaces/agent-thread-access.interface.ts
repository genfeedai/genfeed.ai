import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import type {
  AgentThreadAccessLevel,
  AgentThreadKind,
} from '@genfeedai/contracts';

/** What a request needs from a thread. */
export type AgentThreadAccessNeed = 'view' | 'collaborate' | 'manage';

/** The columns the access check reads from a thread. */
export interface AgentThreadAccessRow {
  brandId: string | null;
  id: string;
  kind: AgentThreadKind | string;
  organizationId: string;
  status: string | null;
  userId: string;
}

/** A thread the actor may use, and how. */
export interface AgentThreadAccess {
  /** Owner, or the strongest live share that still applies to the actor. */
  accessLevel: AgentThreadAccessLevel;
  /** The owner or an organization admin: may change sharing. */
  canManageShares: boolean;
  thread: AgentThreadAccessRow;
}

/**
 * What the thread list needs to add shared threads for one viewer. `brandIds`
 * is `undefined` when the viewer reaches every brand of the organization.
 */
export interface AgentThreadListAccessScope extends BrandAccessActor {
  brandIds: string[] | undefined;
}

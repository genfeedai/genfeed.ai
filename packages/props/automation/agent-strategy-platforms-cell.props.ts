import type { ICredential } from '@genfeedai/contracts/interfaces';

export interface AgentStrategyPlatformsCellProps {
  /** Platform keys the policy publishes to (lowercase, e.g. `instagram`). */
  platforms: string[];
  /** Connected credentials for the current brand. */
  credentials: ICredential[];
}

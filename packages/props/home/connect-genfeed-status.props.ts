import type { ApiKey } from '@genfeedai/models/auth/api-key.model';
import type { VerifiedMcpConnection } from '@genfeedai/props/home/operational-home.props';

export interface UseConnectGenfeedStatusOptions {
  /** Re-read the connection state on this interval; `false` stops polling. */
  pollIntervalMs?: number | false;
}

export type UseConnectGenfeedStatusResult =
  | {
      connections: VerifiedMcpConnection[];
      error: null;
      key: ApiKey;
      refresh: () => Promise<void>;
      status: 'configured';
      verifiedAt: string;
    }
  | {
      connections: VerifiedMcpConnection[];
      error: Error;
      key: null;
      refresh: () => Promise<void>;
      status: 'error';
      verifiedAt: null;
    }
  | {
      connections: VerifiedMcpConnection[];
      error: null;
      key: null;
      refresh: () => Promise<void>;
      status: 'loading' | 'unconfigured';
      verifiedAt: null;
    };

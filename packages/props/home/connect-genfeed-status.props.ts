import type { ApiKey } from '@genfeedai/models/auth/api-key.model';

export type UseConnectGenfeedStatusResult =
  | {
      error: null;
      key: ApiKey;
      refresh: () => Promise<void>;
      status: 'configured';
      verifiedAt: string;
    }
  | {
      error: Error;
      key: null;
      refresh: () => Promise<void>;
      status: 'error';
      verifiedAt: null;
    }
  | {
      error: null;
      key: null;
      refresh: () => Promise<void>;
      status: 'loading' | 'unconfigured';
      verifiedAt: null;
    };

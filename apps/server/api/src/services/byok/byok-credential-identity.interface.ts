import type { ByokProvider } from '@genfeedai/contracts';

/** Secret-bearing dispatch data stays in memory; only credentialId may enter a frozen plan. */
export interface ResolvedByokCredential {
  credentialId: string;
  apiKey: string;
  apiSecret?: string;
}

/** The org's own key for the provider that serves a model, resolved once. */
export interface ModelByokKey {
  provider: ByokProvider;
  apiKey: string;
  apiSecret?: string;
}

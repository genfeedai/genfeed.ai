/** Secret-bearing dispatch data stays in memory; only credentialId may enter a frozen plan. */
export interface ResolvedByokCredential {
  credentialId: string;
  apiKey: string;
  apiSecret?: string;
}

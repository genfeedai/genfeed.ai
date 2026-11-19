export interface OAuthConnectContext {
  brandId: string;
  credentialId?: string;
  shouldOfferHistoryImport?: boolean;
}

/** A provider authorization URL to send the tab to, and where to come back. */
export interface OAuthAuthorizationRedirect extends OAuthConnectContext {
  authorizationUrl: string;
  returnTo: string;
}

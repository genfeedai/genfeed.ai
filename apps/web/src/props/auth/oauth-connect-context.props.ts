export interface OAuthConnectContext {
  brandId: string;
  credentialId?: string;
}

/** A provider authorization URL to send the tab to, and where to come back. */
export interface OAuthAuthorizationRedirect {
  authorizationUrl: string;
  brandId: string;
  credentialId?: string;
  returnTo: string;
}

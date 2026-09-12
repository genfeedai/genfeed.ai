export interface OAuthPlatformFormProps {
  platform: string;
}

export type VerifyResult =
  | { status: 'loading' }
  | { status: 'success' }
  /**
   * The provider token exchange succeeded, but the connected account is
   * ambiguous (Instagram: several eligible professional accounts and no
   * automatic resolution). `credentialId` identifies the unconnected,
   * unidentified row so the caller can fetch its candidate accounts and let
   * the operator pick one before the flow can be treated as complete.
   */
  | { status: 'selecting'; credentialId: string }
  | { status: 'error'; canRetry: boolean; errorMessage: string };

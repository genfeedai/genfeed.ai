export interface OAuthPlatformFormProps {
  platform: string;
}

export type VerifyResult =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; canRetry: boolean; errorMessage: string };

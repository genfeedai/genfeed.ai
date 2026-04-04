import type { CredentialPlatform } from '@genfeedai/enums';

export interface PlatformSubmissionStatus {
  platform: CredentialPlatform;
  handle: string;
  credentialId: string;
  status: 'pending' | 'submitting' | 'completed' | 'failed';
  error?: string;
}

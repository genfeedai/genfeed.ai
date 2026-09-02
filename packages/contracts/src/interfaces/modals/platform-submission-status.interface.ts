import type { CredentialPlatform } from '../..';

export interface PlatformSubmissionStatus {
  platform: CredentialPlatform;
  handle: string;
  credentialId: string;
  status: 'pending' | 'submitting' | 'completed' | 'failed';
  error?: string;
}

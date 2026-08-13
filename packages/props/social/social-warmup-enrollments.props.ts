import type { ISocialWarmupEnrollment } from '@genfeedai/interfaces';

export interface UseSocialWarmupEnrollmentOptions {
  autoLoad?: boolean;
  credentialId?: string;
}

export interface UseSocialWarmupEnrollmentResult {
  completeItem: (itemId: string) => Promise<ISocialWarmupEnrollment>;
  data: ISocialWarmupEnrollment | null;
  enroll: (credentialId: string) => Promise<ISocialWarmupEnrollment>;
  error: unknown;
  isLoading: boolean;
  refresh: () => Promise<unknown>;
  reopenItem: (itemId: string) => Promise<ISocialWarmupEnrollment>;
}

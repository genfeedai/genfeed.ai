import type { ManagedCreditsProvisioningResult } from '@services/billing/managed-credits.service';

export type CopyTarget = 'api-key' | 'env';

export interface SuccessState {
  copyError: string | null;
  error: string | null;
  isLoading: boolean;
  result: ManagedCreditsProvisioningResult | null;
}

import { ActivitySource, type ByokProvider } from '@genfeedai/enums';

/**
 * Configuration for the @Credits decorator.
 * Defines credit deduction parameters for API endpoints.
 */
export interface CreditsConfig {
  amount?: number;
  modelKey?: string;
  description: string;
  source?: ActivitySource;
  provider?: ByokProvider;
  isByokBypass?: boolean;
}

import { ActivitySource } from '@genfeedai/enums';

export interface CreditDeductionJobData {
  type: 'deduct-credits' | 'record-byok-usage';
  organizationId: string;
  userId?: string;
  amount: number;
  description: string;
  source: ActivitySource;
  maxOverdraftCredits?: number;
}

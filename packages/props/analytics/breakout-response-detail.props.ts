import type { BreakoutResponseView } from '@genfeedai/contracts/interfaces';

export interface BreakoutResponseDetailProps {
  response: BreakoutResponseView;
}
export interface BreakoutResponsesContentProps {
  brandId: string;
  organizationId: string;
  strategyId?: string;
}

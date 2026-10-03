import type {
  CreditHoldRecoveryAction,
  CreditReservationStatus,
} from '../../enums';

export interface AdminCreditHoldRow {
  id: string;
  amount: number;
  status: CreditReservationStatus;
  ingredientId: string | null;
  provider: string | null;
  expiresAt: string;
  canRelease: boolean;
  canCharge: boolean;
  blockedReason: string | null;
}
export interface AdminCreditHoldReport {
  id: string;
  organizationId: string;
  retrievedAt: string;
  rows: AdminCreditHoldRow[];
  nextCursor: string | null;
}
export interface AdminCreditHoldActionInput {
  action: CreditHoldRecoveryAction;
  reason: string;
}
export interface CreditHoldRecoveryInput extends AdminCreditHoldActionInput {
  organizationId: string;
  reservationId: string;
  operatorUserId?: string;
  expectedProviderExternalId?: string | null;
  expectedReservationMetadata?: Record<string, unknown>;
  expiry?: boolean;
}

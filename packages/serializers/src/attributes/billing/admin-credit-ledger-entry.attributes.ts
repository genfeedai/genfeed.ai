import { createEntityAttributes } from '@genfeedai/helpers';
import { creditTransactionAttributes } from '@serializers/attributes/billing/credit-transaction.attributes';

/** A ledger row as a super admin audits it: who and what each charge belongs to. */
export const adminCreditLedgerEntryAttributes = createEntityAttributes([
  ...creditTransactionAttributes,
  'actorUserId',
  'brandId',
  'reservationId',
  'workflowExecutionId',
  'workflowNodeId',
]);

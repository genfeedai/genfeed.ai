import { CreditTransferKind } from '@genfeedai/contracts';
import type { ICreditTransferLedgerMetadata } from '@genfeedai/contracts/interfaces/billing';
import {
  isRecord,
  readNonEmptyString,
} from '@genfeedai/utils/data/extract.util';

/** What a creator-payment ledger row's metadata holds, read defensively. */
export type CreditTransferMetadataRead = Partial<
  Pick<
    ICreditTransferLedgerMetadata,
    | 'counterpartyOrganizationId'
    | 'feeAmount'
    | 'grossAmount'
    | 'kind'
    | 'message'
    | 'netAmount'
    | 'subjectId'
  >
>;

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/** Reads the transfer fields from a ledger row's JSON metadata. */
export function readCreditTransferMetadata(
  value: unknown,
): CreditTransferMetadataRead | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value.kind;
  return {
    counterpartyOrganizationId: readNonEmptyString(
      value.counterpartyOrganizationId,
    ),
    feeAmount: readNumber(value.feeAmount),
    grossAmount: readNumber(value.grossAmount),
    kind: Object.values(CreditTransferKind).find(
      (candidate) => candidate === kind,
    ),
    message: readNonEmptyString(value.message),
    netAmount: readNumber(value.netAmount),
    subjectId: readNonEmptyString(value.subjectId),
  };
}

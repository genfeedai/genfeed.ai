import {
  CRUN_QUOTE_REASON_CODES,
  type CrunGenerationQuoteResponse,
  type CrunImageQuoteRequest,
  type CrunVideoQuoteRequest,
} from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import type { IHttpErrorPresentationContext } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';

/** Both media clients require the same exact reviewed response and null discriminant. */
export function parseCrunQuoteResponse(
  document: unknown,
  body: Pick<
    CrunImageQuoteRequest | CrunVideoQuoteRequest,
    'model' | 'crunControls'
  >,
): CrunGenerationQuoteResponse {
  if (
    typeof document !== 'object' ||
    document === null ||
    !('data' in document)
  )
    throw new Error('CRUN_PROVIDER_UNAVAILABLE');
  const data = document.data;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('type' in data) ||
    data.type !== 'crun-generation-quote' ||
    !('id' in data) ||
    typeof data.id !== 'string' ||
    !data.id ||
    !('attributes' in data)
  )
    throw new Error('CRUN_PROVIDER_UNAVAILABLE');
  const attributes = data.attributes;
  if (typeof attributes !== 'object' || attributes === null)
    throw new Error('CRUN_PROVIDER_UNAVAILABLE');
  const value = attributes as Record<string, unknown>;
  if (value.modelKey !== body.model)
    throw new Error('CRUN_PROVIDER_UNAVAILABLE');
  if (
    value.isAvailable === true &&
    typeof value.quoteId === 'string' &&
    value.quoteId.length > 0 &&
    value.quoteId.length <= 256 &&
    typeof value.expiresAt === 'string' &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    new Date(value.expiresAt).toISOString() === value.expiresAt &&
    value.contractVersion === body.crunControls.contractVersion &&
    typeof value.credits === 'number' &&
    Number.isSafeInteger(value.credits) &&
    value.credits >= 0 &&
    (value.billingMode === 'credits' || value.billingMode === 'byok') &&
    value.reasonCode === null
  )
    return attributes as CrunGenerationQuoteResponse;
  if (
    value.isAvailable === false &&
    value.quoteId === null &&
    value.expiresAt === null &&
    value.contractVersion === null &&
    value.credits === null &&
    value.billingMode === null &&
    CRUN_QUOTE_REASON_CODES.some((code) => code === value.reasonCode)
  )
    return attributes as CrunGenerationQuoteResponse;
  throw new Error('CRUN_PROVIDER_UNAVAILABLE');
}

/** The composer retains the draft and exposes these admission conflicts itself. */
export function isExpectedCrunQuoteConflict(
  response: IHttpErrorPresentationContext,
): boolean {
  if (response.status !== 409) return false;
  const document = readRecord(response.data);
  const errors = document?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.every((error: unknown) => {
    const code = readString(readRecord(error)?.code);
    return code === 'CRUN_QUOTE_STALE' || code === 'CRUN_QUOTE_IN_PROGRESS';
  });
}

import {
  getJsonApiErrorMember,
  getJsonApiErrorMetaNumber,
} from '@genfeedai/services/core/json-api-error-message';

const TOO_MANY_REQUESTS = 429;

/**
 * True when the API refused a scan because the library has no scans left. The
 * refusal carries the next opening time in its meta; a bare 429 from a rate
 * limiter does not, so it is not mistaken for one.
 */
export function isResearchScanLimitError(error: unknown): boolean {
  return (
    getJsonApiErrorMember(error)?.status === TOO_MANY_REQUESTS &&
    getJsonApiErrorMetaNumber(error, 'nextAvailableAtMs') !== undefined
  );
}

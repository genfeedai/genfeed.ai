import {
  BrandVoiceFailureCode,
  type IBrandVoiceFailureView,
} from '@genfeedai/contracts/interfaces';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';

const FAILURE_KEY_PREFIX = 'failures';

/** Shown when the API returned no code this client has copy for. */
export const BRAND_VOICE_FAILURE_FALLBACK_KEY = `${FAILURE_KEY_PREFIX}.generic`;

/**
 * Catalog key per public failure code, relative to `pages.brandAgentProfile`.
 * A model that returns valid JSON of the wrong shape and one that returns
 * unparseable text are the same thing to a user — output we could not read —
 * so both codes share one message while staying distinct in the logs.
 */
const MESSAGE_KEY_BY_CODE: Record<BrandVoiceFailureCode, string> = {
  [BrandVoiceFailureCode.BRAND_NOT_FOUND]: `${FAILURE_KEY_PREFIX}.brandNotFound`,
  [BrandVoiceFailureCode.EMPTY_OUTPUT]: `${FAILURE_KEY_PREFIX}.emptyOutput`,
  [BrandVoiceFailureCode.INCOMPLETE_PROFILE]: `${FAILURE_KEY_PREFIX}.incompleteProfile`,
  [BrandVoiceFailureCode.MALFORMED_OUTPUT]: `${FAILURE_KEY_PREFIX}.malformedOutput`,
  [BrandVoiceFailureCode.SOURCE_REQUIRED]: `${FAILURE_KEY_PREFIX}.sourceRequired`,
  [BrandVoiceFailureCode.SOURCE_URL_INVALID]: `${FAILURE_KEY_PREFIX}.sourceUrlInvalid`,
  [BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE]: `${FAILURE_KEY_PREFIX}.malformedOutput`,
};

/**
 * True when the API returned a code this client has a message for.
 *
 * `Object.hasOwn` rather than `in`: the server names the code, and `in` also
 * answers for inherited members, so a code of `constructor` or `toString`
 * would skip the fallback and hand the catalog a prototype member instead of
 * a message key.
 */
function isKnownCode(code: string | undefined): code is BrandVoiceFailureCode {
  return code !== undefined && Object.hasOwn(MESSAGE_KEY_BY_CODE, code);
}

/**
 * Turns a failed brand voice generation into the message to show. An error
 * with no recognised code — a network fault, a 500, an older server — falls
 * back to the generic message rather than leaking server prose into the UI.
 */
export function getBrandVoiceFailureView(
  error: unknown,
): IBrandVoiceFailureView {
  const code = getJsonApiErrorMember(error)?.code;

  if (!isKnownCode(code)) {
    return { messageKey: BRAND_VOICE_FAILURE_FALLBACK_KEY };
  }

  return { code, messageKey: MESSAGE_KEY_BY_CODE[code] };
}

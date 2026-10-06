import { BrandVoiceFailureCode } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

import {
  BRAND_VOICE_FAILURE_FALLBACK_KEY,
  getBrandVoiceFailureView,
} from './brand-voice-failure.util';

/** The shape axios hands a caller for a JSON:API error response. */
function buildApiError(code: unknown): unknown {
  return { response: { data: { errors: [{ code, detail: 'server prose' }] } } };
}

describe('getBrandVoiceFailureView', () => {
  it.each([
    [BrandVoiceFailureCode.BRAND_NOT_FOUND, 'failures.brandNotFound'],
    [BrandVoiceFailureCode.EMPTY_OUTPUT, 'failures.emptyOutput'],
    [BrandVoiceFailureCode.INCOMPLETE_PROFILE, 'failures.incompleteProfile'],
    [BrandVoiceFailureCode.MALFORMED_OUTPUT, 'failures.malformedOutput'],
    [BrandVoiceFailureCode.SOURCE_REQUIRED, 'failures.sourceRequired'],
    [BrandVoiceFailureCode.SOURCE_URL_INVALID, 'failures.sourceUrlInvalid'],
    [BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE, 'failures.malformedOutput'],
  ])('maps %s to %s', (code, messageKey) => {
    expect(getBrandVoiceFailureView(buildApiError(code))).toEqual({
      code,
      messageKey,
    });
  });

  it('reads the code from an already-unwrapped error document', () => {
    expect(
      getBrandVoiceFailureView({
        errors: [{ code: BrandVoiceFailureCode.EMPTY_OUTPUT }],
      }),
    ).toEqual({
      code: BrandVoiceFailureCode.EMPTY_OUTPUT,
      messageKey: 'failures.emptyOutput',
    });
  });

  it.each([
    ['an unknown code', buildApiError('something_new')],
    ['the numeric code of the global filter', buildApiError('422')],
    ['a missing code', buildApiError(undefined)],
    ['a non-string code', buildApiError({ nested: true })],
    ['an empty error array', { response: { data: { errors: [] } } }],
    ['a network error', new Error('Network Error')],
    ['a plain 500 body', { response: { data: { message: 'boom' } } }],
    ['nothing at all', undefined],
  ])('falls back to the generic message for %s', (_label, error) => {
    expect(getBrandVoiceFailureView(error)).toEqual({
      messageKey: BRAND_VOICE_FAILURE_FALLBACK_KEY,
    });
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not treat the prototype member %s as a known code',
    (code) => {
      expect(getBrandVoiceFailureView(buildApiError(code))).toEqual({
        messageKey: BRAND_VOICE_FAILURE_FALLBACK_KEY,
      });
    },
  );

  it('never returns the server prose for the UI to render', () => {
    const view = getBrandVoiceFailureView(buildApiError('something_new'));

    expect(JSON.stringify(view)).not.toContain('server prose');
  });
});

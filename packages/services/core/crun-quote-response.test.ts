import { describe, expect, it } from 'vitest';
import {
  isExpectedCrunQuoteConflict,
  parseCrunQuoteResponse,
} from './crun-quote-response';

const body = {
  model: 'crun/google/nano-banana-pro',
  crunControls: { contractVersion: 'reviewed' },
};
const available = {
  isAvailable: true,
  modelKey: body.model,
  quoteId: 'quote',
  expiresAt: '2099-01-01T00:00:00.000Z',
  contractVersion: 'reviewed',
  credits: 11,
  billingMode: 'credits',
  reasonCode: null,
};
function document(attributes: unknown) {
  return { data: { type: 'crun-generation-quote', id: 'preview', attributes } };
}
describe('shared exact Crun quote response', () => {
  it.each([
    'crun/google/nano-banana-pro',
    'crun/seedream/seedream-4.5',
    'crun/kling/v2-5-turbo-pro',
    'crun/google/veo3-1-fast-t2v',
  ])(
    'validates model/version for %s and keeps group credits unchanged',
    (model) => {
      expect(
        parseCrunQuoteResponse(document({ ...available, modelKey: model }), {
          ...body,
          model,
        }),
      ).toEqual({ ...available, modelKey: model });
    },
  );
  it.each(['credits', 'byok'])(
    'retains legitimate zero mode %s',
    (billingMode) => {
      expect(
        parseCrunQuoteResponse(
          document({ ...available, credits: 0, billingMode }),
          body,
        ),
      ).toMatchObject({ credits: 0, billingMode });
    },
  );
  it('preserves the unavailable null discriminant', () => {
    const quote = {
      isAvailable: false,
      modelKey: body.model,
      quoteId: null,
      expiresAt: null,
      contractVersion: null,
      credits: null,
      billingMode: null,
      reasonCode: 'PRICING_UNAVAILABLE',
    };
    expect(parseCrunQuoteResponse(document(quote), body)).toEqual(quote);
    for (const patch of [
      { credits: 0 },
      { quoteId: '' },
      { contractVersion: 'reviewed' },
      { expiresAt: available.expiresAt },
      { billingMode: 'credits' },
      { reasonCode: 'unknown' },
    ])
      expect(() =>
        parseCrunQuoteResponse(document({ ...quote, ...patch }), body),
      ).toThrow('CRUN_PROVIDER_UNAVAILABLE');
  });
  it.each([
    { credits: -1 },
    { credits: 0.1 },
    { credits: Number.NaN },
    { credits: Number.MAX_SAFE_INTEGER + 1 },
    { modelKey: 'wrong' },
    { contractVersion: 'wrong' },
    { billingMode: null },
    { billingMode: 'free' },
    { reasonCode: 'PRICING_UNAVAILABLE' },
    { quoteId: '' },
    { quoteId: 'x'.repeat(257) },
    { expiresAt: 'not-a-date' },
    { expiresAt: '2099-01-01' },
    { isAvailable: 'true' },
  ])('fails closed for malformed available data %j', (patch) => {
    expect(() =>
      parseCrunQuoteResponse(document({ ...available, ...patch }), body),
    ).toThrow('CRUN_PROVIDER_UNAVAILABLE');
  });
  it.each([
    null,
    [],
    {},
    { data: null },
    { data: { type: 'wrong', id: 'preview', attributes: available } },
    { data: { type: 'crun-generation-quote', id: '', attributes: available } },
    {
      data: { type: 'crun-generation-quote', id: 'preview', attributes: null },
    },
  ])('rejects a malformed envelope %j', (value) => {
    expect(() => parseCrunQuoteResponse(value, body)).toThrow(
      'CRUN_PROVIDER_UNAVAILABLE',
    );
  });
});

describe('surface-owned Crun admission recovery', () => {
  it.each(['CRUN_QUOTE_STALE', 'CRUN_QUOTE_IN_PROGRESS'])(
    'recognizes only a 409 %s',
    (code) => {
      expect(
        isExpectedCrunQuoteConflict({
          status: 409,
          data: { errors: [{ code }] },
        }),
      ).toBe(true);
    },
  );
  it.each([
    { status: 500, data: { errors: [{ code: 'CRUN_QUOTE_STALE' }] } },
    { status: 409, data: { errors: [{ code: 'UNRELATED_CONFLICT' }] } },
    {
      status: 409,
      data: { errors: [{ code: 'CRUN_QUOTE_STALE' }, { code: 'OTHER' }] },
    },
    { status: 409, data: { errors: [] } },
    { status: 409, data: null },
  ])('preserves the generic error policy for $status $data', (response) => {
    expect(isExpectedCrunQuoteConflict(response)).toBe(false);
  });
});

import {
  readHeldDurationQuote,
  resolveDurationSettlement,
} from '@api/collections/credits/services/generation-duration-settlement';
import { avatarEngineSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import { describe, expect, it } from 'vitest';

function heldQuote(seconds: number, avatarType = 'photo_avatar') {
  const quote = readHeldDurationQuote({
    assetId: 'ing_1',
    avatarDurationQuote: {
      estimatedSeconds: seconds,
      snapshot: avatarEngineSnapshot('heygen/avatar-iv', avatarType, seconds),
    },
  });
  if (!quote) throw new Error('The fixture must parse');
  return quote;
}

describe('per-second duration settlement', () => {
  it('holds the admission estimate priced from the reviewed avatar rate', () => {
    // $0.0385/s photo avatar: 10 s is $0.385, x3.33 margin is 129 credits.
    expect(heldQuote(10).snapshot.credits).toBe(129);
    // $0.0805/s digital twin: 10 s is $0.805, x3.33 margin is 269 credits.
    expect(heldQuote(10, 'digital_twin').snapshot.credits).toBe(269);
  });

  it('refunds the difference when the clip ran shorter than estimated', () => {
    expect(resolveDurationSettlement(129, heldQuote(10), 5)).toEqual({
      actualCredits: 65,
      actualSeconds: 5,
      settleCredits: 65,
      topUpCredits: 0,
    });
  });

  it('settles the whole hold and tops up the overrun when the clip ran longer', () => {
    expect(resolveDurationSettlement(129, heldQuote(10), 20)).toEqual({
      actualCredits: 257,
      actualSeconds: 20,
      settleCredits: 129,
      topUpCredits: 128,
    });
  });

  it('prices fractional seconds the way HeyGen reports them', () => {
    expect(
      resolveDurationSettlement(129, heldQuote(10), 7.4).actualCredits,
    ).toBe(95);
  });

  it.each([undefined, 0, -3, Number.NaN])(
    'settles at the estimate, never zero, without a usable duration (%s)',
    (seconds) => {
      expect(resolveDurationSettlement(129, heldQuote(10), seconds)).toEqual(
        expect.objectContaining({
          settleCredits: 129,
          topUpCredits: 0,
          unresolvedReason: expect.any(String),
        }),
      );
    },
  );

  it('ignores hold metadata without a frozen per-second quote', () => {
    expect(readHeldDurationQuote({ assetId: 'ing_1' })).toBeUndefined();
    expect(readHeldDurationQuote(null)).toBeUndefined();
    expect(
      readHeldDurationQuote({
        avatarDurationQuote: { estimatedSeconds: 4, snapshot: { credits: 1 } },
      }),
    ).toBeUndefined();
  });
});

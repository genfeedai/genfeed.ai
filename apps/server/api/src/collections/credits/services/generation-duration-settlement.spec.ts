import {
  readHeldDurationQuote,
  resolveDurationSettlement,
} from '@api/collections/credits/services/generation-duration-settlement';
import {
  avatarEngineSnapshot,
  photoAnimationSnapshot,
} from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
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
  it('settles a photo-animation hold to the clip HeyGen returned', () => {
    const quote = readHeldDurationQuote({
      avatarDurationQuote: {
        estimatedSeconds: 12,
        snapshot: photoAnimationSnapshot(12),
      },
    });
    if (!quote) throw new Error('The fixture must parse');

    // $0.0385/s at 3.33x: 12 s holds 154 credits, 8 s costs 103. 20 s is $0.77,
    // past the $0.50 taper knee: $1.665 + $0.27 x 2.0 = $2.205, 221 credits.
    expect(resolveDurationSettlement(154, quote, 8)).toEqual({
      actualCredits: 103,
      actualSeconds: 8,
      settleCredits: 103,
      topUpCredits: 0,
    });
    expect(resolveDurationSettlement(154, quote, 20)).toEqual({
      actualCredits: 221,
      actualSeconds: 20,
      settleCredits: 154,
      topUpCredits: 67,
    });
  });

  it('holds the admission estimate priced from the reviewed avatar rate', () => {
    // $0.0385/s photo avatar: 10 s is $0.385, x3.33 margin is 129 credits.
    expect(heldQuote(10).snapshot.credits).toBe(129);
    // $0.0805/s digital twin: 10 s is $0.805, so $1.665 on the first $0.50
    // plus $0.305 x 2.0 past the taper knee is 228 credits.
    expect(heldQuote(10, 'digital_twin').snapshot.credits).toBe(228);
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
      actualCredits: 221,
      actualSeconds: 20,
      settleCredits: 129,
      topUpCredits: 92,
    });
  });

  it('caps the whole charge at twice the hold and reports the excess', () => {
    const settled = resolveDurationSettlement(129, heldQuote(10), 60);

    // 60 s is $2.31: $1.665 + $1.81 x 2.0 = 529 credits; the render may
    // charge at most 2 x 129.
    expect(settled).toEqual({
      actualCredits: 529,
      actualSeconds: 60,
      forgoneCredits: 271,
      settleCredits: 129,
      topUpCredits: 129,
    });
  });

  it('tops up in full right at the cap', () => {
    const quote = heldQuote(10);
    expect(resolveDurationSettlement(129, quote, 20)).not.toHaveProperty(
      'forgoneCredits',
    );
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

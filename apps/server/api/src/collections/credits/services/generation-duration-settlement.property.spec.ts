import {
  type HeldDurationQuote,
  readHeldDurationQuote,
  resolveDurationSettlement,
} from '@api/collections/credits/services/generation-duration-settlement';
import { avatarEngineSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import { MEDIA_GENERATION_DURATION_MAX_CHARGE_HOLD_MULTIPLE } from '@genfeedai/contracts/constants';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/** Every engine and avatar type the reviewed rate sheet prices. */
const PRICED_AVATARS = [
  { avatarType: 'photo_avatar', endpoint: 'heygen/avatar-iv' },
  { avatarType: 'digital_twin', endpoint: 'heygen/avatar-iv' },
  { avatarType: 'digital_twin', endpoint: 'heygen/avatar-v' },
] as const;

/** One admission quote per engine and avatar type, at a few estimates. */
const quoteArbitrary = fc
  .record({
    avatar: fc.constantFrom(...PRICED_AVATARS),
    estimatedSeconds: fc.integer({ max: 600, min: 1 }),
  })
  .map(
    ({
      avatar: { avatarType, endpoint },
      estimatedSeconds,
    }): HeldDurationQuote => {
      const quote = readHeldDurationQuote({
        avatarDurationQuote: {
          estimatedSeconds,
          snapshot: avatarEngineSnapshot(
            endpoint,
            avatarType,
            estimatedSeconds,
          ),
        },
      });
      if (!quote) throw new Error('The fixture must parse');
      return quote;
    },
  );

/** A clip length the provider can report, including fractional seconds. */
const secondsArbitrary = fc.double({
  max: 1800,
  min: 0.1,
  noDefaultInfinity: true,
  noNaN: true,
});

/** Anything a provider callback can put where a duration belongs. */
const unusableSecondsArbitrary = fc.constantFrom(
  undefined,
  0,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
);

function charged(settlement: ReturnType<typeof resolveDurationSettlement>) {
  return settlement.settleCredits + settlement.topUpCredits;
}

describe('duration settlement properties', () => {
  it('never settles the hold above what was held', () => {
    fc.assert(
      fc.property(quoteArbitrary, secondsArbitrary, (quote, seconds) => {
        const held = quote.snapshot.credits;
        const settlement = resolveDurationSettlement(held, quote, seconds);

        expect(settlement.settleCredits).toBeGreaterThanOrEqual(0);
        expect(settlement.settleCredits).toBeLessThanOrEqual(held);
        expect(settlement.topUpCredits).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('charges the re-priced clip, capped at the per-render multiple of the hold', () => {
    fc.assert(
      fc.property(quoteArbitrary, secondsArbitrary, (quote, seconds) => {
        const held = quote.snapshot.credits;
        const settlement = resolveDurationSettlement(held, quote, seconds);
        const cap = held * MEDIA_GENERATION_DURATION_MAX_CHARGE_HOLD_MULTIPLE;
        const actual = settlement.actualCredits ?? held;

        expect(charged(settlement)).toBe(Math.min(actual, cap));
        // Whatever the cap keeps off the bill is reported, never lost.
        expect(charged(settlement) + (settlement.forgoneCredits ?? 0)).toBe(
          actual,
        );
        // A top-up only follows a fully settled hold.
        if (settlement.topUpCredits > 0)
          expect(settlement.settleCredits).toBe(held);
      }),
    );
  });

  it('never charges less for a longer clip', () => {
    fc.assert(
      fc.property(
        quoteArbitrary,
        secondsArbitrary,
        secondsArbitrary,
        (quote, first, second) => {
          const held = quote.snapshot.credits;
          const [shorter, longer] =
            first <= second ? [first, second] : [second, first];

          expect(
            charged(resolveDurationSettlement(held, quote, shorter)),
          ).toBeLessThanOrEqual(
            charged(resolveDurationSettlement(held, quote, longer)),
          );
        },
      ),
    );
  });

  it('settles exactly the hold when the clip ran the estimated length', () => {
    fc.assert(
      fc.property(quoteArbitrary, (quote) => {
        const held = quote.snapshot.credits;

        expect(
          resolveDurationSettlement(held, quote, quote.estimatedSeconds),
        ).toEqual({
          actualCredits: held,
          actualSeconds: quote.estimatedSeconds,
          settleCredits: held,
          topUpCredits: 0,
        });
      }),
    );
  });

  it('settles at the estimate, never at zero, without a usable duration', () => {
    fc.assert(
      fc.property(
        quoteArbitrary,
        unusableSecondsArbitrary,
        (quote, seconds) => {
          const held = quote.snapshot.credits;
          const settlement = resolveDurationSettlement(held, quote, seconds);

          expect(settlement).toMatchObject({
            settleCredits: held,
            topUpCredits: 0,
          });
          expect(settlement.unresolvedReason).toBeTruthy();
        },
      ),
    );
  });
});

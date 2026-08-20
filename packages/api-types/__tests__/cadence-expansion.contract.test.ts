import { PostCategory } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  buildSlotIdentityKey,
  expandCadenceOccurrences,
  isWithinConsumptionTolerance,
} from '../src/contracts/cadence-expansion.contract';

const CREDENTIAL_ID = 'ccredential01';
const CADENCE_ID = 'ccadence00001';

function twoHourInput() {
  return {
    cadenceId: CADENCE_ID,
    credentialId: CREDENTIAL_ID,
    endsAt: '2026-08-20T22:00:00.000+02:00',
    format: PostCategory.REEL,
    intervalMinutes: 120,
    startsAt: '2026-08-20T00:00:00.000+02:00',
    timezone: 'Europe/Amsterdam',
    windowEndMinute: 22 * 60,
    windowStartMinute: 8 * 60,
  };
}

describe('expandCadenceOccurrences', () => {
  it('expands a two-hour window inclusively for one day', () => {
    const result = expandCadenceOccurrences(twoHourInput(), {
      end: '2026-08-20T23:59:59.000+02:00',
      start: '2026-08-20T00:00:00.000+02:00',
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const hours = result.occurrences.map((occurrence) =>
      new Date(occurrence.instantUtc).toLocaleString('en-GB', {
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        timeZone: 'Europe/Amsterdam',
      }),
    );
    expect(hours).toEqual([
      '08:00',
      '10:00',
      '12:00',
      '14:00',
      '16:00',
      '18:00',
      '20:00',
      '22:00',
    ]);
    expect(result.occurrences[0]?.identityKey).toContain(CADENCE_ID);
    expect(result.occurrences[0]?.identityKey).toContain(PostCategory.REEL);
  });

  it('rejects a cadence with neither end date nor max occurrences', () => {
    const result = expandCadenceOccurrences(
      {
        cadenceId: CADENCE_ID,
        credentialId: CREDENTIAL_ID,
        format: PostCategory.REEL,
        intervalMinutes: 120,
        startsAt: '2026-08-20T00:00:00.000Z',
        timezone: 'UTC',
        windowEndMinute: 12 * 60,
        windowStartMinute: 8 * 60,
      },
      {
        end: '2026-08-20T23:59:59.000Z',
        start: '2026-08-20T00:00:00.000Z',
      },
    );

    expect(result.success).toBe(false);
  });

  it('omits instants outside the requested calendar window', () => {
    const result = expandCadenceOccurrences(twoHourInput(), {
      end: '2026-08-20T12:00:00.000+02:00',
      start: '2026-08-20T09:00:00.000+02:00',
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.occurrences).toHaveLength(2);
  });

  it('honors maxOccurrences', () => {
    const result = expandCadenceOccurrences(
      { ...twoHourInput(), maxOccurrences: 3 },
      {
        end: '2026-08-20T23:59:59.000+02:00',
        start: '2026-08-20T00:00:00.000+02:00',
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.occurrences).toHaveLength(3);
  });
});

describe('buildSlotIdentityKey', () => {
  it('uses manual when cadence is absent', () => {
    expect(
      buildSlotIdentityKey({
        cadenceId: null,
        credentialId: CREDENTIAL_ID,
        format: PostCategory.POST,
        instantUtc: '2026-08-20T08:00:00.000Z',
      }),
    ).toBe(
      `manual|${CREDENTIAL_ID}|${PostCategory.POST}|2026-08-20T08:00:00.000Z`,
    );
  });
});

describe('isWithinConsumptionTolerance', () => {
  it('accepts a 15-minute drag and rejects a 2-hour neighbor', () => {
    expect(
      isWithinConsumptionTolerance(
        '2026-08-20T08:00:00.000Z',
        '2026-08-20T08:15:00.000Z',
      ),
    ).toBe(true);
    expect(
      isWithinConsumptionTolerance(
        '2026-08-20T08:00:00.000Z',
        '2026-08-20T10:00:00.000Z',
      ),
    ).toBe(false);
  });
});

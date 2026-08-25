import {
  PAID_CREATIVE_LONGEVITY_SATURATION_DAYS,
  resolvePaidCreativeLongevity,
} from './paid-creative-longevity';

const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('paid creative longevity scoring', () => {
  it('stays unscored when the archive published no start date', () => {
    expect(resolvePaidCreativeLongevity({}, NOW)).toBeNull();
    expect(
      resolvePaidCreativeLongevity(
        { presentationStartDate: 'not-a-date' },
        NOW,
      ),
    ).toBeNull();
  });

  it('counts the days a still-running creative has been on air', () => {
    const longevity = resolvePaidCreativeLongevity(
      { presentationStartDate: '2026-07-26T12:00:00.000Z' },
      NOW,
    );

    expect(longevity).not.toBeNull();
    expect(longevity?.daysLive).toBe(30);
    expect(longevity?.isStillRunning).toBe(true);
  });

  it('measures a finished creative against its end date, not today', () => {
    const longevity = resolvePaidCreativeLongevity(
      {
        presentationEndDate: '2026-06-01T12:00:00.000Z',
        presentationStartDate: '2026-05-02T12:00:00.000Z',
      },
      NOW,
    );

    expect(longevity?.daysLive).toBe(30);
    expect(longevity?.isStillRunning).toBe(false);
  });

  it('saturates the score once a creative outlives the saturation window', () => {
    const saturated = resolvePaidCreativeLongevity(
      { presentationStartDate: '2026-05-27T12:00:00.000Z' },
      NOW,
    );
    const veteran = resolvePaidCreativeLongevity(
      { presentationStartDate: '2025-08-25T12:00:00.000Z' },
      NOW,
    );

    expect(saturated?.daysLive).toBe(PAID_CREATIVE_LONGEVITY_SATURATION_DAYS);
    expect(saturated?.score).toBe(100);
    expect(veteran?.score).toBe(100);
  });

  it('ranks a longer-running creative above a shorter one', () => {
    const older = resolvePaidCreativeLongevity(
      { presentationStartDate: '2026-06-25T12:00:00.000Z' },
      NOW,
    );
    const newer = resolvePaidCreativeLongevity(
      { presentationStartDate: '2026-08-18T12:00:00.000Z' },
      NOW,
    );

    expect(older?.score).toBeGreaterThan(newer?.score as number);
  });

  it('discounts a halted creative below an identical run that is still live', () => {
    const halted = resolvePaidCreativeLongevity(
      { isHalted: true, presentationStartDate: '2026-05-27T12:00:00.000Z' },
      NOW,
    );
    const live = resolvePaidCreativeLongevity(
      { presentationStartDate: '2026-05-27T12:00:00.000Z' },
      NOW,
    );

    expect(halted?.isStillRunning).toBe(false);
    expect(halted?.score).toBeLessThan(live?.score as number);
    expect(halted?.score).toBeGreaterThan(0);
  });

  it('treats an end date still in the future as a live creative', () => {
    const longevity = resolvePaidCreativeLongevity(
      {
        presentationEndDate: '2026-12-31T12:00:00.000Z',
        presentationStartDate: '2026-07-26T12:00:00.000Z',
      },
      NOW,
    );

    expect(longevity?.daysLive).toBe(30);
    expect(longevity?.isStillRunning).toBe(true);
  });

  it('scores a creative scheduled to start later as zero days on air', () => {
    const longevity = resolvePaidCreativeLongevity(
      { presentationStartDate: '2026-09-25T12:00:00.000Z' },
      NOW,
    );

    expect(longevity?.daysLive).toBe(0);
    expect(longevity?.score).toBe(0);
  });

  it('ignores an unparseable end date instead of discarding the run', () => {
    const longevity = resolvePaidCreativeLongevity(
      {
        presentationEndDate: 'unknown',
        presentationStartDate: '2026-07-26T12:00:00.000Z',
      },
      NOW,
    );

    expect(longevity?.daysLive).toBe(30);
    expect(longevity?.isStillRunning).toBe(true);
  });
});

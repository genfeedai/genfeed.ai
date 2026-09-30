import {
  dayWindowStart,
  decideThrottle,
  hourWindowStart,
  renderCampaignBody,
} from '@api/collections/social-inbox/services/social-reply-campaign.helpers';

const NOW = new Date('2026-07-31T12:00:00.000Z');

function throttleParams(
  overrides: Partial<Parameters<typeof decideThrottle>[0]> = {},
): Parameters<typeof decideThrottle>[0] {
  return {
    dailyCount: 0,
    hourlyCount: 0,
    lastSentAt: null,
    maxPerDay: 50,
    maxPerHour: 10,
    minDelaySeconds: 60,
    now: NOW,
    oldestInDayAt: null,
    oldestInHourAt: null,
    ...overrides,
  };
}

describe('decideThrottle', () => {
  it('sends immediately when no window is exhausted and nothing was sent yet', () => {
    expect(decideThrottle(throttleParams())).toEqual({ delaySeconds: 0 });
  });

  it('holds the tick until the minimum inter-send delay elapses', () => {
    const decision = decideThrottle(
      throttleParams({
        dailyCount: 1,
        hourlyCount: 1,
        lastSentAt: new Date(NOW.getTime() - 20_000),
        minDelaySeconds: 60,
      }),
    );

    expect(decision).toEqual({ delaySeconds: 40, reason: 'min-delay' });
  });

  it('sends once the minimum delay has already passed', () => {
    const decision = decideThrottle(
      throttleParams({
        dailyCount: 1,
        hourlyCount: 1,
        lastSentAt: new Date(NOW.getTime() - 120_000),
        minDelaySeconds: 60,
      }),
    );

    expect(decision).toEqual({ delaySeconds: 0 });
  });

  it('waits for the oldest send to age out of the hourly window', () => {
    // Ten sends in the hour with the oldest 50 minutes back: the window frees in
    // ten minutes, not after a fixed cooldown.
    const decision = decideThrottle(
      throttleParams({
        dailyCount: 10,
        hourlyCount: 10,
        lastSentAt: new Date(NOW.getTime() - 60_000),
        maxPerHour: 10,
        oldestInDayAt: new Date(NOW.getTime() - 50 * 60_000),
        oldestInHourAt: new Date(NOW.getTime() - 50 * 60_000),
      }),
    );

    expect(decision).toEqual({ delaySeconds: 600, reason: 'hourly-window' });
  });

  it('prefers the daily ceiling over the hourly one', () => {
    const decision = decideThrottle(
      throttleParams({
        dailyCount: 50,
        hourlyCount: 10,
        maxPerDay: 50,
        maxPerHour: 10,
        oldestInDayAt: new Date(NOW.getTime() - 23 * 60 * 60_000),
        oldestInHourAt: new Date(NOW.getTime() - 30 * 60_000),
      }),
    );

    expect(decision).toEqual({ delaySeconds: 3600, reason: 'daily-window' });
  });

  it('falls back to a full window when the oldest timestamp is missing', () => {
    const decision = decideThrottle(
      throttleParams({
        dailyCount: 50,
        maxPerDay: 50,
        oldestInDayAt: null,
      }),
    );

    expect(decision).toEqual({ delaySeconds: 86_400, reason: 'daily-window' });
  });

  it('never returns a non-positive delay for an already-expired window', () => {
    const decision = decideThrottle(
      throttleParams({
        hourlyCount: 10,
        maxPerHour: 10,
        oldestInHourAt: new Date(NOW.getTime() - 2 * 60 * 60_000),
      }),
    );

    expect(decision.delaySeconds).toBeGreaterThan(0);
  });
});

describe('window helpers', () => {
  it('slides the hour and day windows back from now', () => {
    expect(hourWindowStart(NOW).toISOString()).toBe('2026-07-31T11:00:00.000Z');
    expect(dayWindowStart(NOW).toISOString()).toBe('2026-07-30T12:00:00.000Z');
  });
});

describe('renderCampaignBody', () => {
  it('substitutes the supported placeholders', () => {
    expect(
      renderCampaignBody('Hi {{name}} ({{handle}}) — thanks!', {
        handle: '@taylor',
        name: 'Taylor',
      }),
    ).toBe('Hi Taylor (@taylor) — thanks!');
  });

  it('tolerates whitespace inside the placeholder braces', () => {
    expect(renderCampaignBody('Hey {{ name }}', { name: 'Jordan' })).toBe(
      'Hey Jordan',
    );
  });

  it('renders an empty string for a missing value', () => {
    expect(
      renderCampaignBody('Hi {{name}}!', { handle: null, name: null }),
    ).toBe('Hi !');
  });

  it('leaves unknown placeholders verbatim so a typo is visible in review', () => {
    expect(renderCampaignBody('Hi {{fullName}}', { name: 'Taylor' })).toBe(
      'Hi {{fullName}}',
    );
  });
});

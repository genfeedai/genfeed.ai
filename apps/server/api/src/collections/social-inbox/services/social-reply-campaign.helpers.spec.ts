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
});

describe('window helpers', () => {
  it('slides the hour and day windows back from now', () => {
    expect(hourWindowStart(NOW).toISOString()).toBe('2026-07-31T11:00:00.000Z');
    expect(dayWindowStart(NOW).toISOString()).toBe('2026-07-30T12:00:00.000Z');
  });
});

describe('renderCampaignBody', () => {
  it('renders an empty string for a missing value', () => {
    expect(
      renderCampaignBody('Hi {{name}}!', { handle: null, name: null }),
    ).toBe('Hi !');
  });
});

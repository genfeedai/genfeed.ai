import { isAvatarTwinTrackingDue } from '@api/collections/avatar-twins/utils/avatar-twin-tracking.util';

const NOW = new Date('2026-11-08T12:00:00.000Z');

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

describe('isAvatarTwinTrackingDue', () => {
  it.each([
    ['never checked', 10, null, true],
    ['young, checked 1 minute ago', 10, 1, false],
    ['young, checked 2 minutes ago', 10, 2, true],
    ['a few hours old, checked 10 minutes ago', 180, 10, false],
    ['a few hours old, checked 15 minutes ago', 180, 15, true],
    ['two days old, checked 30 minutes ago', 2 * 24 * 60, 30, false],
    ['two days old, checked an hour ago', 2 * 24 * 60, 60, true],
    ['eight days old, never checked', 8 * 24 * 60, null, false],
    ['eight days old, checked a day ago', 8 * 24 * 60, 24 * 60, false],
  ])('%s', (_label, ageMinutes, checkedMinutesAgo, expected) => {
    expect(
      isAvatarTwinTrackingDue(
        {
          createdAt: minutesAgo(ageMinutes),
          lastCheckedAt:
            checkedMinutesAgo === null ? null : minutesAgo(checkedMinutesAgo),
        },
        NOW,
      ),
    ).toBe(expected);
  });
});

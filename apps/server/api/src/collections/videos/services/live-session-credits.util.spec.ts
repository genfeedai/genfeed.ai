import {
  assertLiveSessionCeilingSeconds,
  liveSessionElapsedSeconds,
} from '@api/collections/videos/services/live-session-credits.util';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('assertLiveSessionCeilingSeconds', () => {
  it('requires a user-selected integer ceiling', () => {
    expect(() => assertLiveSessionCeilingSeconds(undefined)).toThrow(
      BadRequestException,
    );
    expect(() => assertLiveSessionCeilingSeconds(30)).toThrow(
      BadRequestException,
    );
    expect(assertLiveSessionCeilingSeconds(900)).toBe(900);
  });
});

describe('liveSessionElapsedSeconds', () => {
  const startedAt = new Date('2026-09-18T12:00:00.000Z');

  it('caps elapsed time at the declared ceiling', () => {
    expect(
      liveSessionElapsedSeconds({
        ceilingSeconds: 60,
        now: new Date('2026-09-18T12:02:00.000Z'),
        startedAt,
      }),
    ).toBe(60);
  });

  it('ceils partial seconds of wall-clock including idle', () => {
    expect(
      liveSessionElapsedSeconds({
        ceilingSeconds: 900,
        now: new Date('2026-09-18T12:00:10.100Z'),
        startedAt,
      }),
    ).toBe(11);
  });
});

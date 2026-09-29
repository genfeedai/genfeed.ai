import { assertLiveSessionCeilingSeconds } from '@api/collections/videos/services/live-session-credits.util';
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

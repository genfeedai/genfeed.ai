import { EnvironmentService } from '@services/core/environment.service';
import { describe, expect, it } from 'vitest';
import { BOOKING_HREF } from './booking.data';

describe('booking data', () => {
  it('links directly to the configured booking page', () => {
    expect(BOOKING_HREF).toBe(EnvironmentService.calendly);
    expect(BOOKING_HREF).toMatch(/^https:\/\/calendly\.com\//);
  });
});

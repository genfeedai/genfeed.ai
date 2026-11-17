import { describe, expect, it } from 'vitest';
import {
  HEYGEN_POLL_DELAY_MS,
  HEYGEN_POLL_MAX_ATTEMPTS,
} from './heygen-poll-job.interface';
import {
  HIGGSFIELD_POLL_DELAY_MS,
  HIGGSFIELD_POLL_MAX_ATTEMPTS,
} from './higgsfield-poll-job.interface';
import {
  REPLICATE_POLL_DELAY_MS,
  REPLICATE_POLL_MAX_ATTEMPTS,
} from './replicate-poll-job.interface';

describe('job-data constants', () => {
  it('preserves the heygen-poll cadence contract', () => {
    expect(HEYGEN_POLL_DELAY_MS).toBe(15_000);
    expect(HEYGEN_POLL_MAX_ATTEMPTS).toBe(40);
    expect(REPLICATE_POLL_DELAY_MS).toBe(15_000);
    expect(REPLICATE_POLL_MAX_ATTEMPTS).toBe(40);
  });

  it('keeps the higgsfield-poll ceiling at the 15 minutes the in-process wait allowed', () => {
    expect(HIGGSFIELD_POLL_DELAY_MS * HIGGSFIELD_POLL_MAX_ATTEMPTS).toBe(
      900_000,
    );
  });
});

import { GenerationReservationBarrier } from '@api/collections/content-runs/services/generation-reservation-barrier';
import { describe, expect, it } from 'vitest';

describe('GenerationReservationBarrier', () => {
  it('contains a failure before the first arrival without an unhandled rejection', async () => {
    const observed: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => observed.push(reason);
    const barrier = new GenerationReservationBarrier(1);
    const error = new Error('reservation failed');

    process.on('unhandledRejection', onUnhandledRejection);
    try {
      barrier.fail(error);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(observed).toEqual([]);
      await expect(barrier.arrive()).rejects.toBe(error);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});

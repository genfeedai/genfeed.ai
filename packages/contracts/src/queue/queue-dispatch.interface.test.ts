import { describe, expect, it } from 'vitest';
import {
  isQueueDispatchEnqueued,
  QueueDegradationReason,
  type QueueDispatchDegraded,
  type QueueDispatchEnqueued,
  QueueDispatchStatus,
} from './queue-dispatch.interface';

describe('queue-dispatch.interface', () => {
  it('preserves the dispatch status wire values', () => {
    expect(QueueDispatchStatus.ENQUEUED).toBe('enqueued');
    expect(QueueDispatchStatus.DEGRADED).toBe('degraded');
    expect(Object.values(QueueDispatchStatus)).toHaveLength(2);
  });

  it('preserves the degradation reason wire values', () => {
    expect(QueueDegradationReason.NO_BROKER_CONFIGURED).toBe(
      'no-broker-configured',
    );
    expect(QueueDegradationReason.BROKER_UNREACHABLE).toBe(
      'broker-unreachable',
    );
    expect(Object.values(QueueDegradationReason)).toHaveLength(2);
  });

  describe('isQueueDispatchEnqueued', () => {
    const enqueued: QueueDispatchEnqueued = {
      jobId: 'job-1',
      queueName: 'default',
      status: QueueDispatchStatus.ENQUEUED,
    };
    const degraded: QueueDispatchDegraded = {
      detail: 'no broker configured for this deployment',
      queueName: 'default',
      reason: QueueDegradationReason.NO_BROKER_CONFIGURED,
      status: QueueDispatchStatus.DEGRADED,
    };

    it('narrows an enqueued result to the enqueued branch', () => {
      expect(isQueueDispatchEnqueued(enqueued)).toBe(true);
    });

    it('rejects a degraded result', () => {
      expect(isQueueDispatchEnqueued(degraded)).toBe(false);
    });
  });
});

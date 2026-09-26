import { describe, expect, it } from 'vitest';
import {
  ALL_QUEUE_NAMES,
  CREDIT_DEDUCTION_QUEUE,
  DEFAULT_QUEUE,
  HEYGEN_POLL_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  PLATFORM_SYSTEM_WORKFLOW_QUEUE,
  REPLICATE_POLL_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
  WORKFLOW_JOB_PRIORITY,
} from './queue-names.constant';

describe('queue-names.constant', () => {
  it('preserves the Redis queue names already in production', () => {
    // These string values are wire-level contracts: changing one orphans
    // in-flight jobs in Redis. Lock them down.
    expect(DEFAULT_QUEUE).toBe('default');
    expect(HEYGEN_POLL_QUEUE).toBe('heygen-poll');
    expect(NOTIFICATION_DELIVERY_QUEUE).toBe('notification-delivery');
    expect(REPLICATE_POLL_QUEUE).toBe('replicate-poll');
    expect(CREDIT_DEDUCTION_QUEUE).toBe('credit-deduction');
    expect(WORKFLOW_EXECUTION_QUEUE).toBe('workflow-execution');
    expect(PLATFORM_SYSTEM_WORKFLOW_QUEUE).toBe('platform-system-workflow');
  });

  it('orders workflow job priority so lower numbers run first', () => {
    expect(WORKFLOW_JOB_PRIORITY.AGENT_CONVERSATION).toBeLessThan(
      WORKFLOW_JOB_PRIORITY.DEFAULT,
    );
    expect(WORKFLOW_JOB_PRIORITY.DEFAULT).toBeLessThan(
      WORKFLOW_JOB_PRIORITY.PLATFORM_SWEEP,
    );
  });

  it('lists every queue exactly once', () => {
    expect(ALL_QUEUE_NAMES.length).toBeGreaterThan(0);
    expect(new Set(ALL_QUEUE_NAMES).size).toBe(ALL_QUEUE_NAMES.length);
  });

  it('contains only non-empty string names', () => {
    for (const name of ALL_QUEUE_NAMES) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_QUEUE,
  ALL_QUEUE_NAMES,
  CREDIT_DEDUCTION_QUEUE,
  DEFAULT_QUEUE,
  HEYGEN_POLL_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  TRIGGER_EVALUATION_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
  WORKSPACE_TASK_QUEUE,
} from './queue-names.constant';

describe('queue-names.constant', () => {
  it('preserves the Redis queue names already in production', () => {
    // These string values are wire-level contracts: changing one orphans
    // in-flight jobs in Redis. Lock them down.
    expect(DEFAULT_QUEUE).toBe('default');
    expect(AGENT_RUN_QUEUE).toBe('agent-run');
    expect(WORKSPACE_TASK_QUEUE).toBe('workspace-task');
    expect(HEYGEN_POLL_QUEUE).toBe('heygen-poll');
    expect(NOTIFICATION_DELIVERY_QUEUE).toBe('notification-delivery');
    expect(CREDIT_DEDUCTION_QUEUE).toBe('credit-deduction');
    expect(WORKFLOW_EXECUTION_QUEUE).toBe('workflow-execution');
    expect(TRIGGER_EVALUATION_QUEUE).toBe('triggers.evaluate');
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

import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_QUEUE,
  ALL_QUEUE_NAMES,
  ANALYTICS_SOCIAL_QUEUE,
  CAMPAIGN_PROCESSING_QUEUE,
  CLIP_ANALYZE_QUEUE,
  CLIP_FACTORY_QUEUE,
  CREDIT_DEDUCTION_QUEUE,
  DEFAULT_QUEUE,
  HEYGEN_POLL_QUEUE,
  LIFECYCLE_EMAIL_QUEUE,
  REPLY_BOT_POLLING_QUEUE,
  TRIGGER_EVALUATION_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
  WORKSPACE_TASK_QUEUE,
} from './queue-names.constant';

describe('queue-names.constant', () => {
  it('preserves the Redis queue names already in production', () => {
    // These string values are wire-level contracts: changing one orphans
    // in-flight jobs in Redis. Lock them down.
    expect(DEFAULT_QUEUE).toBe('default');
    expect(ANALYTICS_SOCIAL_QUEUE).toBe('analytics-social');
    expect(REPLY_BOT_POLLING_QUEUE).toBe('reply-bot-polling');
    expect(CAMPAIGN_PROCESSING_QUEUE).toBe('campaign-processing');
    expect(AGENT_RUN_QUEUE).toBe('agent-run');
    expect(WORKSPACE_TASK_QUEUE).toBe('workspace-task');
    expect(HEYGEN_POLL_QUEUE).toBe('heygen-poll');
    expect(LIFECYCLE_EMAIL_QUEUE).toBe('lifecycle-email');
    expect(CREDIT_DEDUCTION_QUEUE).toBe('credit-deduction');
    expect(CLIP_ANALYZE_QUEUE).toBe('clip-analyze');
    expect(CLIP_FACTORY_QUEUE).toBe('clip-factory');
    expect(WORKFLOW_EXECUTION_QUEUE).toBe('workflow-execution');
    expect(TRIGGER_EVALUATION_QUEUE).toBe('triggers.evaluate');
  });

  it('lists every queue exactly once', () => {
    expect(ALL_QUEUE_NAMES.length).toBeGreaterThanOrEqual(33);
    expect(new Set(ALL_QUEUE_NAMES).size).toBe(ALL_QUEUE_NAMES.length);
  });

  it('contains only non-empty string names', () => {
    for (const name of ALL_QUEUE_NAMES) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

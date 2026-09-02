import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JOB_OPTIONS,
  EXECUTION_STATUS,
  JOB_PRIORITY,
  JOB_STATUS,
  JOB_TYPES,
  MAX_RECOVERY_ATTEMPTS,
  NODE_RESULT_STATUS,
  PREDICTION_STATUS,
  QUEUE_CONCURRENCY,
  QUEUE_NAMES,
} from './queue';

describe('queue constants', () => {
  it('preserves the BullMQ queue names', () => {
    expect(QUEUE_NAMES.WORKFLOW_ORCHESTRATOR).toBe('workflow-orchestrator');
    expect(QUEUE_NAMES.IMAGE_GENERATION).toBe('image-generation');
    expect(QUEUE_NAMES.VIDEO_GENERATION).toBe('video-generation');
    expect(QUEUE_NAMES.LLM_GENERATION).toBe('llm-generation');
    expect(QUEUE_NAMES.PROCESSING).toBe('processing');
  });

  it('pairs every work queue with a DLQ counterpart', () => {
    expect(QUEUE_NAMES.DLQ_WORKFLOW).toBe('dlq-workflow-orchestrator');
    expect(QUEUE_NAMES.DLQ_IMAGE).toBe('dlq-image-generation');
    expect(QUEUE_NAMES.DLQ_VIDEO).toBe('dlq-video-generation');
    expect(QUEUE_NAMES.DLQ_LLM).toBe('dlq-llm-generation');
    expect(QUEUE_NAMES.DLQ_PROCESSING).toBe('dlq-processing');
  });

  it('preserves the job type names', () => {
    expect(Object.values(JOB_TYPES)).toEqual([
      'execute-node',
      'execute-workflow',
      'generate-image',
      'generate-text',
      'generate-video',
      'reframe-image',
      'reframe-video',
      'upscale-image',
      'upscale-video',
    ]);
  });

  it('orders job priorities critical-first (lower number wins in BullMQ)', () => {
    expect(JOB_PRIORITY.CRITICAL).toBeLessThan(JOB_PRIORITY.HIGH);
    expect(JOB_PRIORITY.HIGH).toBeLessThan(JOB_PRIORITY.NORMAL);
    expect(JOB_PRIORITY.NORMAL).toBeLessThan(JOB_PRIORITY.LOW);
  });

  it('configures retries with backoff for every non-DLQ queue', () => {
    const workQueues = [
      QUEUE_NAMES.WORKFLOW_ORCHESTRATOR,
      QUEUE_NAMES.IMAGE_GENERATION,
      QUEUE_NAMES.VIDEO_GENERATION,
      QUEUE_NAMES.LLM_GENERATION,
      QUEUE_NAMES.PROCESSING,
    ] as const;
    for (const queue of workQueues) {
      const options = DEFAULT_JOB_OPTIONS[queue];
      expect(options.attempts).toBe(3);
      expect(options.backoff.delay).toBeGreaterThan(0);
      expect(['exponential', 'fixed']).toContain(options.backoff.type);
      expect(QUEUE_CONCURRENCY[queue]).toBeGreaterThan(0);
    }
  });

  it('preserves the status vocabularies', () => {
    expect(Object.values(JOB_STATUS)).toHaveLength(8);
    expect(JOB_STATUS.RECOVERED).toBe('recovered');
    expect(Object.values(EXECUTION_STATUS)).toEqual([
      'cancelled',
      'completed',
      'failed',
      'pending',
      'running',
    ]);
    expect(Object.values(PREDICTION_STATUS)).toEqual([
      'canceled',
      'failed',
      'pending',
      'processing',
      'succeeded',
    ]);
    expect(Object.values(NODE_RESULT_STATUS)).toEqual([
      'complete',
      'error',
      'pending',
      'processing',
    ]);
  });

  it('caps recovery attempts', () => {
    expect(MAX_RECOVERY_ATTEMPTS).toBe(3);
  });
});

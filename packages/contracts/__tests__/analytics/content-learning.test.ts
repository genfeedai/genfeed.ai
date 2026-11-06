import { describe, expect, it } from 'vitest';
import {
  ContentLearningArm,
  ContentLearningMode,
  ContentLearningOperationStatus,
  ContentLearningRunStatus,
} from '../../src/enums/content-learning.enum';

describe('persisted learning vocabulary', () => {
  it('retains fixed arms and explicit safe lifecycle modes', () => {
    expect(Object.values(ContentLearningArm)).toEqual([
      'baseline-v1',
      'question-example-v1',
      'proof-steps-v1',
    ]);
    expect(Object.values(ContentLearningMode)).toContain('shadow');
    expect(Object.values(ContentLearningMode)).toContain('paused');
  });

  it('matches the learning_run_status_check and learning_operation_status_check constraints', () => {
    expect(Object.values(ContentLearningRunStatus)).toEqual([
      'pending',
      'running',
      'completed',
      'insufficient_data',
      'failed',
      'cancelled',
      'invalidated',
    ]);
    expect(Object.values(ContentLearningOperationStatus)).toEqual([
      'pending',
      'running',
      'completed',
      'failed',
      'cancelled',
      'invalidated',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ContentLearningArm,
  ContentLearningMode,
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
});

import { describe, expect, it } from 'vitest';
import {
  LEARNING_DEPENDENCY_KINDS,
  LEARNING_GLOBAL_DEPENDENCY_KINDS,
  LEARNING_TENANT_DEPENDENCY_KINDS,
  validLearningDependencyRef,
  validLearningRunTerminalResult,
} from './content-learning.interface';

describe('learning dependency lineage contract', () => {
  it('registers the specified 26 kinds without a generic current version', () => {
    expect(LEARNING_GLOBAL_DEPENDENCY_KINDS).toHaveLength(5);
    expect(LEARNING_TENANT_DEPENDENCY_KINDS).toHaveLength(21);
    expect(LEARNING_DEPENDENCY_KINDS).toHaveLength(26);
    expect(LEARNING_DEPENDENCY_KINDS).not.toContain('scope-state');
    expect(
      validLearningDependencyRef({
        kind: 'run',
        id: 'run',
        organizationId: null,
        version: 'current',
      }),
    ).toBe(false);
  });
});

describe('learning run terminal result', () => {
  it('rejects array runStatus instead of coercing it through String()', () => {
    expect(
      validLearningRunTerminalResult({
        runStatus: ['completed'],
        reasonCode: null,
        resultArtifactId: null,
        completedAt: '2026-09-30T12:00:00.000Z',
        trainingCount: null,
        requiredTrainingCount: null,
      }),
    ).toBe(false);
  });
});

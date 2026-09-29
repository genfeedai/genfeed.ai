import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/generation-eta.helper', () => ({
  formatEtaDuration: (ms: number) => {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  },
  formatEtaRange: (ms: number) => {
    const lower = Math.max(5000, Math.round(ms * 0.7));
    const upper = Math.round(ms * 1.35);
    return `${Math.round(lower / 1000)}-${Math.round(upper / 1000)}s`;
  },
  shouldDisplayEta: (
    eta:
      | { remainingDurationMs?: number; estimatedDurationMs?: number }
      | null
      | undefined,
  ) => {
    const durationMs =
      eta?.remainingDurationMs ?? eta?.estimatedDurationMs ?? 0;
    return durationMs >= 5000;
  },
}));

import { getExecutionEtaDisplayState } from './eta-display';

describe('getExecutionEtaDisplayState', () => {
  it('should return actualDurationLabel from eta.actualDurationMs', () => {
    const result = getExecutionEtaDisplayState({
      eta: { actualDurationMs: 30000 },
      status: WorkflowExecutionStatus.COMPLETED,
    });

    expect(result.actualDurationLabel).toBe('30s');
  });

  it('should return etaLabel with range for low confidence', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 30000,
        etaConfidence: 'low',
        remainingDurationMs: 20000,
      },
      status: WorkflowExecutionStatus.RUNNING,
    });

    expect(result.etaLabel).toContain('Usually takes');
  });

  it('should use estimatedDurationMs when remainingDurationMs is missing for high confidence', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 25000,
        etaConfidence: 'high',
      },
      status: WorkflowExecutionStatus.RUNNING,
    });

    expect(result.etaLabel).toContain('About');
    expect(result.etaLabel).toContain('25s');
    expect(result.etaLabel).toContain('left');
  });

  it('should return phaseLabel from eta.currentPhase', () => {
    const result = getExecutionEtaDisplayState({
      eta: { currentPhase: 'Generating image' },
      status: WorkflowExecutionStatus.RUNNING,
    });

    expect(result.phaseLabel).toBe('Generating image');
  });

  it('should return reassuranceLabel when estimated duration >= 60s and status is running', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 120000,
        etaConfidence: 'high',
        remainingDurationMs: 90000,
      },
      status: WorkflowExecutionStatus.RUNNING,
    });

    expect(result.reassuranceLabel).toContain('You can keep working');
  });

  it('should return elapsedLabel when startedAt is a valid date', () => {
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
    const result = getExecutionEtaDisplayState({
      eta: { startedAt: tenSecondsAgo },
      status: WorkflowExecutionStatus.RUNNING,
    });

    expect(result.elapsedLabel).not.toBeNull();
  });

  it('should return null elapsedLabel when startedAt is invalid', () => {
    const result = getExecutionEtaDisplayState({
      eta: { startedAt: 'not-a-date' },
      status: WorkflowExecutionStatus.RUNNING,
    });

    expect(result.elapsedLabel).toBeNull();
  });
});

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
  it('should return null labels when no eta is provided', () => {
    const result = getExecutionEtaDisplayState({ status: 'running' });

    expect(result.etaLabel).toBeNull();
    expect(result.actualDurationLabel).toBeNull();
    expect(result.elapsedLabel).toBeNull();
    expect(result.phaseLabel).toBeNull();
    expect(result.reassuranceLabel).toBeNull();
  });

  it('should return actualDurationLabel from eta.actualDurationMs', () => {
    const result = getExecutionEtaDisplayState({
      eta: { actualDurationMs: 30000 },
      status: 'completed',
    });

    expect(result.actualDurationLabel).toBe('30s');
  });

  it('should fall back to durationMs when eta.actualDurationMs is missing', () => {
    const result = getExecutionEtaDisplayState({
      durationMs: 45000,
      eta: {},
      status: 'completed',
    });

    expect(result.actualDurationLabel).toBe('45s');
  });

  it('should return null actualDurationLabel when duration is zero', () => {
    const result = getExecutionEtaDisplayState({
      durationMs: 0,
      status: 'completed',
    });

    expect(result.actualDurationLabel).toBeNull();
  });

  it('should return etaLabel with range for low confidence', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 30000,
        etaConfidence: 'low',
        remainingDurationMs: 20000,
      },
      status: 'running',
    });

    expect(result.etaLabel).toContain('Usually takes');
  });

  it('should return etaLabel with remaining time for high confidence', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 30000,
        etaConfidence: 'high',
        remainingDurationMs: 15000,
      },
      status: 'running',
    });

    expect(result.etaLabel).toContain('About');
    expect(result.etaLabel).toContain('left');
  });

  it('should use estimatedDurationMs when remainingDurationMs is missing for high confidence', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 25000,
        etaConfidence: 'high',
      },
      status: 'running',
    });

    expect(result.etaLabel).toContain('About');
    expect(result.etaLabel).toContain('25s');
    expect(result.etaLabel).toContain('left');
  });

  it('should not show etaLabel for completed status', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 30000,
        etaConfidence: 'high',
        remainingDurationMs: 15000,
      },
      status: 'completed',
    });

    expect(result.etaLabel).toBeNull();
  });

  it('should not show etaLabel for failed status', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 30000,
        etaConfidence: 'high',
        remainingDurationMs: 15000,
      },
      status: 'failed',
    });

    expect(result.etaLabel).toBeNull();
  });

  it('should not show etaLabel when eta is not visible (below threshold)', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 2000,
        etaConfidence: 'high',
        remainingDurationMs: 1000,
      },
      status: 'running',
    });

    expect(result.etaLabel).toBeNull();
  });

  it('should return phaseLabel from eta.currentPhase', () => {
    const result = getExecutionEtaDisplayState({
      eta: { currentPhase: 'Generating image' },
      status: 'running',
    });

    expect(result.phaseLabel).toBe('Generating image');
  });

  it('should return null phaseLabel when currentPhase is missing', () => {
    const result = getExecutionEtaDisplayState({
      eta: {},
      status: 'running',
    });

    expect(result.phaseLabel).toBeNull();
  });

  it('should return reassuranceLabel when estimated duration >= 60s and status is running', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 120000,
        etaConfidence: 'high',
        remainingDurationMs: 90000,
      },
      status: 'running',
    });

    expect(result.reassuranceLabel).toContain('You can keep working');
  });

  it('should not return reassuranceLabel when estimated duration < 60s', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 30000,
        etaConfidence: 'high',
        remainingDurationMs: 20000,
      },
      status: 'running',
    });

    expect(result.reassuranceLabel).toBeNull();
  });

  it('should not return reassuranceLabel when status is completed', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 120000,
        remainingDurationMs: 0,
      },
      status: 'completed',
    });

    expect(result.reassuranceLabel).toBeNull();
  });

  it('should not return reassuranceLabel when status is failed', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 120000,
        remainingDurationMs: 0,
      },
      status: 'failed',
    });

    expect(result.reassuranceLabel).toBeNull();
  });

  it('should handle case-insensitive status comparison', () => {
    const result = getExecutionEtaDisplayState({
      eta: {
        estimatedDurationMs: 30000,
        etaConfidence: 'high',
        remainingDurationMs: 15000,
      },
      status: 'COMPLETED',
    });

    expect(result.etaLabel).toBeNull();
  });

  it('should return elapsedLabel when startedAt is a valid date', () => {
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
    const result = getExecutionEtaDisplayState({
      eta: { startedAt: tenSecondsAgo },
      status: 'running',
    });

    expect(result.elapsedLabel).not.toBeNull();
  });

  it('should return null elapsedLabel when startedAt is missing', () => {
    const result = getExecutionEtaDisplayState({
      eta: {},
      status: 'running',
    });

    expect(result.elapsedLabel).toBeNull();
  });

  it('should return null elapsedLabel when startedAt is invalid', () => {
    const result = getExecutionEtaDisplayState({
      eta: { startedAt: 'not-a-date' },
      status: 'running',
    });

    expect(result.elapsedLabel).toBeNull();
  });
});

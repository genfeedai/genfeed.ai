import { describe, expect, it } from 'vitest';
import {
  type ConversationShellGateSnapshot,
  evaluateConversationShellGates,
} from './conversation-shell-gates';

function passingSnapshot(
  overrides: Partial<ConversationShellGateSnapshot> = {},
): ConversationShellGateSnapshot {
  return {
    approvalPinIntegrity: { attempts: 100, exactMatches: 100 },
    cohort: 'internal',
    compatibilityReads: { eligibleReads: 10_000, legacyReads: 99 },
    denominatorSnapshotId: 'inventory-209-2026-07-15',
    deploymentMode: 'community',
    fallbackUsage: { enabledSessions: 1_000, fallbackSessions: 9 },
    firstUsefulPaint: {
      legacyObservations: 1_000,
      legacyP75Ms: 1_000,
      legacyP95Ms: 2_000,
      shellObservations: 1_000,
      shellP75Ms: 1_100,
      shellP95Ms: 2_300,
    },
    manualValidation: {
      isAccessibilityPassed: true,
      isResponsivePassed: true,
      isRollbackRehearsalPassed: true,
    },
    observationWindow: {
      completeUtcDays: 14,
      end: '2026-07-15T00:00:00.000Z',
      start: '2026-07-01T00:00:00.000Z',
    },
    protectedRouteParity: { passed: 209, total: 209 },
    restoration: {
      enabledSessions: 100,
      failures: 9,
      transitions: 2_000,
    },
    scopeSafety: { attempts: 1_000, violations: 0 },
    staleContext: { attempts: 100, blocked: 100 },
    telemetryQueryVersion: 1,
    ...overrides,
  };
}

describe('conversation shell numeric rollout gates', () => {
  it('passes only when every locked threshold and manual gate is evidenced', () => {
    const report = evaluateConversationShellGates(
      passingSnapshot(),
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(report.isPassed).toBe(true);
    expect(report.gates.every((gate) => gate.status === 'pass')).toBe(true);
  });

  it('does not fake an incomplete 14-day observation window', () => {
    const report = evaluateConversationShellGates(
      passingSnapshot({
        observationWindow: {
          completeUtcDays: 13,
          end: '2026-07-15T00:00:00.000Z',
          start: '2026-07-02T00:00:00.000Z',
        },
      }),
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(report.isPassed).toBe(false);
    expect(
      report.gates.find((gate) => gate.name === 'observation_window'),
    ).toMatchObject({ status: 'insufficient_observation' });
  });

  it.each([
    ['scope_violations', { scopeSafety: { attempts: 1_000, violations: 1 } }],
    [
      'url_restoration_failures',
      {
        restoration: { enabledSessions: 100, failures: 10, transitions: 2_000 },
      },
    ],
    [
      'fallback_usage',
      { fallbackUsage: { enabledSessions: 1_000, fallbackSessions: 10 } },
    ],
    [
      'compatibility_reads',
      { compatibilityReads: { eligibleReads: 10_000, legacyReads: 100 } },
    ],
    [
      'first_useful_paint',
      {
        firstUsefulPaint: {
          legacyObservations: 1_000,
          legacyP75Ms: 1_000,
          legacyP95Ms: 2_000,
          shellObservations: 1_000,
          shellP75Ms: 1_101,
          shellP95Ms: 2_301,
        },
      },
    ],
  ] as const)('fails the exact %s boundary', (gateName, overrides) => {
    const report = evaluateConversationShellGates(
      passingSnapshot(overrides as Partial<ConversationShellGateSnapshot>),
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(report.isPassed).toBe(false);
    expect(report.gates.find((gate) => gate.name === gateName)).toMatchObject({
      status: 'fail',
    });
  });

  it('marks low-volume cohorts insufficient instead of passing them', () => {
    const report = evaluateConversationShellGates(
      passingSnapshot({
        fallbackUsage: { enabledSessions: 999, fallbackSessions: 0 },
      }),
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(
      report.gates.find((gate) => gate.name === 'fallback_usage'),
    ).toMatchObject({ status: 'insufficient_observation' });
  });

  it('rejects contradictory or negative telemetry snapshots', () => {
    expect(() =>
      evaluateConversationShellGates(
        passingSnapshot({
          compatibilityReads: { eligibleReads: 10_000, legacyReads: -1 },
        }),
      ),
    ).toThrow('invalid or contradictory');
    expect(() =>
      evaluateConversationShellGates(
        passingSnapshot({
          approvalPinIntegrity: { attempts: 100, exactMatches: 101 },
        }),
      ),
    ).toThrow('invalid or contradictory');
  });

  it('rejects a claimed day count that does not match UTC boundaries', () => {
    const report = evaluateConversationShellGates(
      passingSnapshot({
        observationWindow: {
          completeUtcDays: 14,
          end: '2026-07-15T00:00:00.000Z',
          start: '2026-06-30T00:00:00.000Z',
        },
      }),
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(
      report.gates.find((gate) => gate.name === 'observation_window'),
    ).toMatchObject({ status: 'insufficient_observation' });
  });
});

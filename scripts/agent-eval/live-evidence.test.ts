import { describe, expect, it } from 'vitest';
import { SMOKE_CRITERIA, validateLiveEvidence } from './live-evidence';

// Synthetic records test the validator only. They are never written as smoke evidence.
function validatorInput() {
  return {
    schemaVersion: 1,
    evidenceKind: 'production-like-canonical-smoke',
    sourceRevision: 'a'.repeat(40),
    environment: 'validator-test-only',
    captureRef: 'synthetic-validator-input',
    usesMockTransport: false,
    usesMockProvider: false,
    journeys: Array.from({ length: 5 }, (_, index) => ({
      attemptSequence: index + 1,
      startedAt: `2026-09-08T0${index}:00:00.000Z`,
      finishedAt: `2026-09-08T0${index}:01:00.000Z`,
      threadId: `thread-${index}`,
      runIds: [`run-${index}`],
      workflowExecutionId: `workflow-${index}`,
      preparedIntentId: `intent-${index}`,
      confirmationId: `confirmation-${index}`,
      logicalWriteKey: String(index).repeat(64),
      model: {
        provider: 'fixture-provider',
        providerVersion: 'fixture-provider-v1',
        model: 'fixture-model',
        modelVersion: 'fixture-model-v1',
      },
      counters: {
        duplicateMutations: 0,
        staleTerminalStates: 0,
        unhandledClientErrors: 0,
        deadEnds: 0,
      },
      observations: SMOKE_CRITERIA.map((criterion) => ({
        criterion,
        status: 'passed',
        runId: `run-${index}`,
        evidenceRefs: ['synthetic-ref'],
      })),
    })),
  };
}
describe('live smoke evidence completeness', () => {
  it('accepts a complete correlated shape, without authenticating its claims', () => {
    expect(validateLiveEvidence(validatorInput())).toEqual({
      complete: true,
      errors: [],
    });
  });
  it('rejects missing evidence and deterministic reports', () => {
    expect(validateLiveEvidence(undefined).complete).toBe(false);
    expect(
      validateLiveEvidence({
        evidenceKind: 'deterministic-contract-evaluation',
      }).complete,
    ).toBe(false);
  });
  it.each([
    'missing-criterion',
    'duplicate-criterion',
    'blocked-criterion',
    'uncorrelated-run',
    'duplicate-mutation',
    'skipped-attempt',
    'reused-run',
    'reused-proof',
    'overlap',
    'unknown-model',
    'mock-provider',
  ])('rejects %s', (fault) => {
    const input = validatorInput();
    const journey = input.journeys[1];
    if (!journey) throw new Error('Missing validator fixture');
    const firstObservation = journey.observations[0];
    if (!firstObservation) throw new Error('Missing observation fixture');
    switch (fault) {
      case 'missing-criterion':
        journey.observations.pop();
        break;
      case 'duplicate-criterion':
        journey.observations.push(firstObservation);
        break;
      case 'blocked-criterion':
        firstObservation.status = 'blocked';
        break;
      case 'uncorrelated-run':
        firstObservation.runId = 'other-run';
        break;
      case 'duplicate-mutation':
        journey.counters.duplicateMutations = 1;
        break;
      case 'skipped-attempt':
        journey.attemptSequence = 9;
        break;
      case 'reused-run':
        journey.runIds = ['run-0'];
        break;
      case 'reused-proof':
        journey.confirmationId = 'confirmation-0';
        break;
      case 'overlap':
        journey.startedAt = '2026-09-08T00:00:00.000Z';
        break;
      case 'unknown-model':
        journey.model.modelVersion = 'unknown';
        break;
      case 'mock-provider':
        input.usesMockProvider = true;
        break;
    }
    expect(validateLiveEvidence(input).complete).toBe(false);
  });
});

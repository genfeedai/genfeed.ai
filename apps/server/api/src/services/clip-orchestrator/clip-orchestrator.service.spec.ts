import { CLIP_ORCHESTRATOR_EVENTS } from '@api/services/clip-orchestrator/clip-orchestrator.events';
import { ClipOrchestratorService } from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { ClipRunState } from '@api/services/clip-orchestrator/clip-run-state.enum';
import type { StartClipRunDto } from '@api/services/clip-orchestrator/dto/start-clip-run.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

function makeDto(overrides: Partial<StartClipRunDto> = {}): StartClipRunDto {
  return {
    organizationId: 'org-1',
    projectId: 'proj-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('ClipOrchestratorService', () => {
  let service: ClipOrchestratorService;
  let emitter: EventEmitter2;

  beforeEach(() => {
    emitter = new EventEmitter2();
    service = new ClipOrchestratorService(emitter);
  });

  // -------------------------------------------------------------------------
  // 1. Start a run
  // -------------------------------------------------------------------------
  it('should create a new run in idle state', () => {
    const run = service.startRun(makeDto());
    expect(run.currentState).toBe(ClipRunState.Idle);
    expect(run.projectId).toBe('proj-1');
    expect(run.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. Valid transitions
  // -------------------------------------------------------------------------
  it('should transition idle → generating → reframing (skip merging) → publishing → done', () => {
    const run = service.startRun(makeDto({ skipMerging: true }));

    service.transition(run.id, ClipRunState.Generating);
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Generating);

    service.transition(run.id, ClipRunState.Reframing);
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Reframing);

    service.transition(run.id, ClipRunState.Publishing);
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Publishing);

    service.transition(run.id, ClipRunState.Done);
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Done);
  });

  // -------------------------------------------------------------------------
  // 3. Invalid transition throws
  // -------------------------------------------------------------------------
  it('should throw on invalid transition (idle → publishing)', () => {
    const run = service.startRun(makeDto());
    expect(() => service.transition(run.id, ClipRunState.Publishing)).toThrow(
      'Invalid state transition',
    );
  });

  // -------------------------------------------------------------------------
  // 4. Confirmation checkpoint
  // -------------------------------------------------------------------------
  it('should pause at publishing when confirmationRequired is true', () => {
    const run = service.startRun(makeDto({ confirmationRequired: true }));

    service.transition(run.id, ClipRunState.Generating);
    service.transition(run.id, ClipRunState.Reframing);

    // Publishing is a checkpoint — should go to awaiting_confirmation
    service.transition(run.id, ClipRunState.Publishing);
    expect(service.getRun(run.id)!.currentState).toBe(
      ClipRunState.AwaitingConfirmation,
    );
  });

  // -------------------------------------------------------------------------
  // 5. Confirm and proceed
  // -------------------------------------------------------------------------
  it('should confirm and move to pending state', () => {
    const run = service.startRun(makeDto({ confirmationRequired: true }));

    service.transition(run.id, ClipRunState.Generating);
    service.transition(run.id, ClipRunState.Reframing);
    service.transition(run.id, ClipRunState.Publishing);
    expect(service.getRun(run.id)!.currentState).toBe(
      ClipRunState.AwaitingConfirmation,
    );

    service.confirm(run.id);
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Publishing);
  });

  // -------------------------------------------------------------------------
  // 6. Retry logic — retries under max
  // -------------------------------------------------------------------------
  it('should allow retries up to MAX_RETRIES and then fail', () => {
    const run = service.startRun(makeDto());
    service.transition(run.id, ClipRunState.Generating);

    // First two retries should keep the state
    service.failStep(run.id, 'network error');
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Generating);
    expect(service.canRetry(run.id)).toBe(true);

    service.failStep(run.id, 'network error');
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Generating);
    expect(service.canRetry(run.id)).toBe(true);

    // Third retry exhausts → fails
    service.failStep(run.id, 'network error');
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Failed);
    expect(service.getRun(run.id)!.error).toContain('3 retries');
  });

  // -------------------------------------------------------------------------
  // 7. Exponential backoff delay
  // -------------------------------------------------------------------------
  it('should calculate exponential backoff delay', () => {
    const run = service.startRun(makeDto());
    service.transition(run.id, ClipRunState.Generating);

    // Initial delay (retryCount=0)
    expect(service.getRetryDelay(run.id)).toBe(1000);

    service.failStep(run.id, 'err');
    // After 1 failure (retryCount=1)
    expect(service.getRetryDelay(run.id)).toBe(2000);

    service.failStep(run.id, 'err');
    // After 2 failures (retryCount=2)
    expect(service.getRetryDelay(run.id)).toBe(4000);
  });

  // -------------------------------------------------------------------------
  // 8. Retry from last good state
  // -------------------------------------------------------------------------
  it('should retry a failed run from the last good state', () => {
    const run = service.startRun(makeDto());
    service.transition(run.id, ClipRunState.Generating);
    service.completeStep(run.id, { clips: 3 });
    service.transition(run.id, ClipRunState.Reframing);

    // Fail the run
    service.failStep(run.id, 'crash');
    service.failStep(run.id, 'crash');
    service.failStep(run.id, 'crash');
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Failed);

    // Retry — should go back to generating (last completed step)
    service.retryFromLastGood(run.id);
    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Generating);
  });

  // -------------------------------------------------------------------------
  // 9. Events are emitted on state change
  // -------------------------------------------------------------------------
  it('should emit state change events', () => {
    const events: unknown[] = [];
    emitter.on(CLIP_ORCHESTRATOR_EVENTS.STATE_CHANGED, (e) => events.push(e));

    const run = service.startRun(makeDto());
    service.transition(run.id, ClipRunState.Generating);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      currentState: ClipRunState.Generating,
      previousState: ClipRunState.Idle,
      runId: run.id,
    });
  });

  // -------------------------------------------------------------------------
  // 10. getNextState respects skipMerging
  // -------------------------------------------------------------------------
  it('should skip merging in getNextState when skipMerging is true', () => {
    const run = service.startRun(makeDto({ skipMerging: true }));
    service.transition(run.id, ClipRunState.Generating);

    const next = service.getNextState(run.id);
    expect(next).toBe(ClipRunState.Reframing);
  });

  // -------------------------------------------------------------------------
  // 11. getRun returns undefined for unknown ID
  // -------------------------------------------------------------------------
  it('should return undefined for unknown run ID', () => {
    expect(service.getRun('nonexistent')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 12. Full pipeline with merging
  // -------------------------------------------------------------------------
  it('should transition through full pipeline including merging', () => {
    const run = service.startRun(makeDto());

    service.transition(run.id, ClipRunState.Generating);
    service.transition(run.id, ClipRunState.Merging);
    service.transition(run.id, ClipRunState.Reframing);
    service.transition(run.id, ClipRunState.Publishing);
    service.transition(run.id, ClipRunState.Done);

    expect(service.getRun(run.id)!.currentState).toBe(ClipRunState.Done);
    expect(service.getRun(run.id)!.steps).toHaveLength(5); // 5 transitions
  });
});

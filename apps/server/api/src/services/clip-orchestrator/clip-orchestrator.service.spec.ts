import { CLIP_ORCHESTRATOR_EVENTS } from '@api/services/clip-orchestrator/clip-orchestrator.events';
import { ClipOrchestratorService } from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { ClipOrchestratorStateStore } from '@api/services/clip-orchestrator/clip-orchestrator-state.store';
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

function createStateStore(): ClipOrchestratorStateStore {
  const values = new Map<string, unknown>();
  return {
    delete: vi.fn(async (namespace: string, id: string) => {
      values.delete(`${namespace}:${id}`);
    }),
    get: vi.fn(
      async <T>(namespace: string, id: string, revive?: (value: T) => T) => {
        const value = values.get(`${namespace}:${id}`) as T | undefined;
        return value && revive ? revive(value) : value;
      },
    ),
    set: vi.fn(async <T>(namespace: string, id: string, value: T) => {
      values.set(`${namespace}:${id}`, value);
    }),
  } as unknown as ClipOrchestratorStateStore;
}

describe('ClipOrchestratorService', () => {
  let service: ClipOrchestratorService;
  let emitter: EventEmitter2;
  let stateStore: ClipOrchestratorStateStore;

  beforeEach(() => {
    emitter = new EventEmitter2();
    stateStore = createStateStore();
    service = new ClipOrchestratorService(emitter, stateStore);
  });

  // -------------------------------------------------------------------------
  // 1. Start a run
  // -------------------------------------------------------------------------
  it('should create a new run in idle state', async () => {
    const run = await service.startRun(makeDto());
    expect(run.currentState).toBe(ClipRunState.Idle);
    expect(run.projectId).toBe('proj-1');
    expect(run.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. Valid transitions
  // -------------------------------------------------------------------------
  it('should transition idle → generating → reframing (skip merging) → publishing → done', async () => {
    const run = await service.startRun(makeDto({ skipMerging: true }));

    await service.transition(run.id, ClipRunState.Generating);
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Generating,
    );

    await service.transition(run.id, ClipRunState.Reframing);
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Reframing,
    );

    await service.transition(run.id, ClipRunState.Publishing);
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Publishing,
    );

    await service.transition(run.id, ClipRunState.Done);
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Done,
    );
  });

  // -------------------------------------------------------------------------
  // 3. Invalid transition throws
  // -------------------------------------------------------------------------
  it('should throw on invalid transition (idle → publishing)', async () => {
    const run = await service.startRun(makeDto());
    await expect(
      service.transition(run.id, ClipRunState.Publishing),
    ).rejects.toThrow('Invalid state transition');
  });

  // -------------------------------------------------------------------------
  // 4. Confirmation checkpoint
  // -------------------------------------------------------------------------
  it('should pause at publishing when confirmationRequired is true', async () => {
    const run = await service.startRun(makeDto({ confirmationRequired: true }));

    await service.transition(run.id, ClipRunState.Generating);
    await service.transition(run.id, ClipRunState.Reframing);

    // Publishing is a checkpoint — should go to awaiting_confirmation
    await service.transition(run.id, ClipRunState.Publishing);
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.AwaitingConfirmation,
    );
  });

  // -------------------------------------------------------------------------
  // 5. Confirm and proceed
  // -------------------------------------------------------------------------
  it('should confirm and move to pending state', async () => {
    const run = await service.startRun(makeDto({ confirmationRequired: true }));

    await service.transition(run.id, ClipRunState.Generating);
    await service.transition(run.id, ClipRunState.Reframing);
    await service.transition(run.id, ClipRunState.Publishing);
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.AwaitingConfirmation,
    );

    await service.confirm(run.id);
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Publishing,
    );
  });

  // -------------------------------------------------------------------------
  // 6. Retry logic — retries under max
  // -------------------------------------------------------------------------
  it('should allow retries up to MAX_RETRIES and then fail', async () => {
    const run = await service.startRun(makeDto());
    await service.transition(run.id, ClipRunState.Generating);

    // First two retries should keep the state
    await service.failStep(run.id, 'network error');
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Generating,
    );
    expect(await service.canRetry(run.id)).toBe(true);

    await service.failStep(run.id, 'network error');
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Generating,
    );
    expect(await service.canRetry(run.id)).toBe(true);

    // Third retry exhausts → fails
    await service.failStep(run.id, 'network error');
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Failed,
    );
    expect((await service.getRun(run.id))!.error).toContain('3 retries');
  });

  // -------------------------------------------------------------------------
  // 7. Exponential backoff delay
  // -------------------------------------------------------------------------
  it('should calculate exponential backoff delay', async () => {
    const run = await service.startRun(makeDto());
    await service.transition(run.id, ClipRunState.Generating);

    // Initial delay (retryCount=0)
    expect(await service.getRetryDelay(run.id)).toBe(1000);

    await service.failStep(run.id, 'err');
    // After 1 failure (retryCount=1)
    expect(await service.getRetryDelay(run.id)).toBe(2000);

    await service.failStep(run.id, 'err');
    // After 2 failures (retryCount=2)
    expect(await service.getRetryDelay(run.id)).toBe(4000);
  });

  // -------------------------------------------------------------------------
  // 8. Retry from last good state
  // -------------------------------------------------------------------------
  it('should retry a failed run from the last good state', async () => {
    const run = await service.startRun(makeDto());
    await service.transition(run.id, ClipRunState.Generating);
    await service.completeStep(run.id, { clips: 3 });
    await service.transition(run.id, ClipRunState.Reframing);

    // Fail the run
    await service.failStep(run.id, 'crash');
    await service.failStep(run.id, 'crash');
    await service.failStep(run.id, 'crash');
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Failed,
    );

    // Retry — should go back to generating (last completed step)
    await service.retryFromLastGood(run.id);
    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Generating,
    );
  });

  // -------------------------------------------------------------------------
  // 9. Events are emitted on state change
  // -------------------------------------------------------------------------
  it('should emit state change events', async () => {
    const events: unknown[] = [];
    emitter.on(CLIP_ORCHESTRATOR_EVENTS.STATE_CHANGED, (e) => events.push(e));

    const run = await service.startRun(makeDto());
    await service.transition(run.id, ClipRunState.Generating);

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
  it('should skip merging in getNextState when skipMerging is true', async () => {
    const run = await service.startRun(makeDto({ skipMerging: true }));
    await service.transition(run.id, ClipRunState.Generating);

    const next = await service.getNextState(run.id);
    expect(next).toBe(ClipRunState.Reframing);
  });

  // -------------------------------------------------------------------------
  // 11. getRun returns undefined for unknown ID
  // -------------------------------------------------------------------------
  it('should return undefined for unknown run ID', async () => {
    await expect(service.getRun('nonexistent')).resolves.toBeUndefined();
  });

  it('should retain runs across service instances', async () => {
    const run = await service.startRun(
      makeDto({ projectId: 'proj-persisted' }),
    );
    const nextService = new ClipOrchestratorService(
      new EventEmitter2(),
      stateStore,
    );

    expect(await nextService.getRun(run.id)).toMatchObject({
      id: run.id,
      projectId: 'proj-persisted',
    });
  });

  // -------------------------------------------------------------------------
  // 12. Full pipeline with merging
  // -------------------------------------------------------------------------
  it('should transition through full pipeline including merging', async () => {
    const run = await service.startRun(makeDto());

    await service.transition(run.id, ClipRunState.Generating);
    await service.transition(run.id, ClipRunState.Merging);
    await service.transition(run.id, ClipRunState.Reframing);
    await service.transition(run.id, ClipRunState.Publishing);
    await service.transition(run.id, ClipRunState.Done);

    expect((await service.getRun(run.id))!.currentState).toBe(
      ClipRunState.Done,
    );
    expect((await service.getRun(run.id))!.steps).toHaveLength(5); // 5 transitions
  });
});

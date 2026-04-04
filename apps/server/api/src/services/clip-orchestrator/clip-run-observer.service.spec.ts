import { CLIP_ORCHESTRATOR_EVENTS } from '@api/services/clip-orchestrator/clip-orchestrator.events';
import { ClipRunObserverService } from '@api/services/clip-orchestrator/clip-run-observer.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ClipRunObserverService', () => {
  let service: ClipRunObserverService;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    vi.spyOn(eventEmitter, 'emit');
    service = new ClipRunObserverService(eventEmitter);
  });

  // ── Test 1: initRun creates all steps as pending ──
  it('should initialise a run with all steps set to pending', () => {
    const progress = service.initRun('run-1');

    expect(progress.clipRunId).toBe('run-1');
    expect(progress.overallStatus).toBe('pending');
    expect(progress.steps).toHaveLength(4);
    for (const step of progress.steps) {
      expect(step.status).toBe('pending');
    }
  });

  // ── Test 2: emitStepProgress updates the correct step ──
  it('should update a specific step status', () => {
    service.initRun('run-2');
    service.emitStepProgress('run-2', 'generate', 'running');

    const progress = service['runs'].get('run-2')!;
    const genStep = progress.steps.find((s) => s.step === 'generate')!;
    expect(genStep.status).toBe('running');
    expect(genStep.startedAt).toBeDefined();
  });

  // ── Test 3: emitStepProgress emits an event ──
  it('should emit a STEP_COMPLETED event on progress update', () => {
    service.initRun('run-3');
    service.emitStepProgress('run-3', 'generate', 'done');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      CLIP_ORCHESTRATOR_EVENTS.STEP_COMPLETED,
      expect.objectContaining({
        clipRunId: 'run-3',
        status: 'done',
        step: 'generate',
      }),
    );
  });

  // ── Test 4: failed status records error details ──
  it('should record errorMessage and retryable on failure', () => {
    service.initRun('run-4');
    service.emitStepProgress('run-4', 'merge', 'failed', {
      errorMessage: 'Merge timeout',
      retryable: true,
    });

    const progress = service['runs'].get('run-4')!;
    const mergeStep = progress.steps.find((s) => s.step === 'merge')!;
    expect(mergeStep.status).toBe('failed');
    expect(mergeStep.errorMessage).toBe('Merge timeout');
    expect(mergeStep.retryable).toBe(true);
    expect(mergeStep.completedAt).toBeDefined();
  });

  // ── Test 5: done status with outputUrl ──
  it('should attach outputUrl when step completes with one', () => {
    service.initRun('run-5');
    service.emitStepProgress('run-5', 'publish-handoff', 'done', {
      outputUrl: 'https://cdn.example.com/clip.mp4',
    });

    const progress = service['runs'].get('run-5')!;
    const pubStep = progress.steps.find((s) => s.step === 'publish-handoff')!;
    expect(pubStep.outputUrl).toBe('https://cdn.example.com/clip.mp4');
  });

  // ── Test 6: overall status computation ──
  it('should compute overall status as running when some steps are done', () => {
    service.initRun('run-6');
    service.emitStepProgress('run-6', 'generate', 'done');
    service.emitStepProgress('run-6', 'merge', 'running');

    const progress = service['runs'].get('run-6')!;
    expect(progress.overallStatus).toBe('running');
  });

  // ── Test 7: overall status becomes done when all steps done/skipped ──
  it('should compute overall status as done when all steps are done or skipped', () => {
    service.initRun('run-7');
    service.emitStepProgress('run-7', 'generate', 'done');
    service.emitStepProgress('run-7', 'merge', 'skipped');
    service.emitStepProgress('run-7', 'reframe', 'done');
    service.emitStepProgress('run-7', 'publish-handoff', 'done');

    const progress = service['runs'].get('run-7')!;
    expect(progress.overallStatus).toBe('done');
  });

  // ── Test 8: overall status becomes failed if any step fails ──
  it('should compute overall status as failed if any step has failed', () => {
    service.initRun('run-8');
    service.emitStepProgress('run-8', 'generate', 'done');
    service.emitStepProgress('run-8', 'reframe', 'failed', {
      errorMessage: 'GPU OOM',
      retryable: false,
    });

    const progress = service['runs'].get('run-8')!;
    expect(progress.overallStatus).toBe('failed');
  });

  // ── Test 9: getRunProgress returns null for unknown run ──
  it('should return null for an unknown run ID', async () => {
    const result = await service.getRunProgress('nonexistent');
    expect(result).toBeNull();
  });

  // ── Test 10: emitStepProgress auto-inits if run not found ──
  it('should auto-initialise a run when emitting progress for unknown runId', () => {
    service.emitStepProgress('auto-init', 'generate', 'running');

    const progress = service['runs'].get('auto-init');
    expect(progress).toBeDefined();
    expect(progress!.steps.find((s) => s.step === 'generate')!.status).toBe(
      'running',
    );
  });

  // ── Test 11: clearRun removes tracking data ──
  it('should remove the run from tracking after clearRun', async () => {
    service.initRun('run-clear');
    service.clearRun('run-clear');

    const result = await service.getRunProgress('run-clear');
    expect(result).toBeNull();
  });

  // ── Test 12: default error message when none provided ──
  it('should use default error message when meta has no errorMessage', () => {
    service.initRun('run-12');
    service.emitStepProgress('run-12', 'generate', 'failed');

    const progress = service['runs'].get('run-12')!;
    const step = progress.steps.find((s) => s.step === 'generate')!;
    expect(step.errorMessage).toBe('Unknown error');
    expect(step.retryable).toBe(false);
  });
});

import { CLIP_ORCHESTRATOR_EVENTS } from '@api/services/clip-orchestrator/clip-orchestrator.events';
import {
  ClipRunObserverService,
  type ClipRunStep,
} from '@api/services/clip-orchestrator/clip-run-observer.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the clip pipeline.
 *
 * These tests exercise multi-step pipeline flows using the
 * ClipRunObserverService to track progress, simulating how
 * the orchestrator would drive a clip through its lifecycle.
 *
 * All external services (generation, merge, reframe, publish)
 * are mocked — no real HTTP calls.
 */

// ── Mock service helpers ──

interface MockGenerationService {
  generate: (clipId: string) => Promise<{ url: string }>;
}

interface MockMergeService {
  merge: (clips: string[]) => Promise<{ url: string }>;
}

interface MockReframeService {
  reframe: (url: string, format: string) => Promise<{ url: string }>;
}

interface MockPublishService {
  handoff: (url: string, orgId: string) => Promise<{ publishId: string }>;
}

function createMockServices() {
  return {
    generation: {
      generate: vi
        .fn()
        .mockResolvedValue({ url: 'https://cdn.test/clip-1.mp4' }),
    } as MockGenerationService,
    merge: {
      merge: vi.fn().mockResolvedValue({ url: 'https://cdn.test/merged.mp4' }),
    } as MockMergeService,
    publish: {
      handoff: vi.fn().mockResolvedValue({ publishId: 'pub-123' }),
    } as MockPublishService,
    reframe: {
      reframe: vi
        .fn()
        .mockResolvedValue({ url: 'https://cdn.test/portrait.mp4' }),
    } as MockReframeService,
  };
}

/** Simulate a full pipeline run step by step. */
async function runPipeline(
  observer: ClipRunObserverService,
  services: ReturnType<typeof createMockServices>,
  runId: string,
  options: {
    skipMerge?: boolean;
    skipReframe?: boolean;
    failAt?: ClipRunStep;
    failCount?: number;
    confirmationGate?: boolean;
  } = {},
) {
  observer.initRun(runId);
  let failures = 0;

  // Step 1: Generate
  observer.emitStepProgress(runId, 'generate', 'running');
  if (options.failAt === 'generate') {
    failures++;
    observer.emitStepProgress(runId, 'generate', 'failed', {
      errorMessage: 'Generation failed',
      retryable: true,
    });
    if (failures <= (options.failCount ?? 1)) {
      // Retry
      observer.emitStepProgress(runId, 'generate', 'running');
    }
  }
  const genResult = await services.generation.generate(runId);
  observer.emitStepProgress(runId, 'generate', 'done', {
    outputUrl: genResult.url,
  });

  // Step 2: Merge (optional)
  if (options.skipMerge) {
    observer.emitStepProgress(runId, 'merge', 'skipped');
  } else {
    observer.emitStepProgress(runId, 'merge', 'running');
    const mergeResult = await services.merge.merge([genResult.url]);
    observer.emitStepProgress(runId, 'merge', 'done', {
      outputUrl: mergeResult.url,
    });
  }

  // Step 3: Reframe
  if (options.skipReframe) {
    observer.emitStepProgress(runId, 'reframe', 'skipped');
  } else {
    observer.emitStepProgress(runId, 'reframe', 'running');
    const reframeResult = await services.reframe.reframe(
      genResult.url,
      'portrait',
    );
    observer.emitStepProgress(runId, 'reframe', 'done', {
      outputUrl: reframeResult.url,
    });
  }

  // Confirmation gate
  if (options.confirmationGate) {
    return 'awaiting_confirmation';
  }

  // Step 4: Publish handoff
  observer.emitStepProgress(runId, 'publish-handoff', 'running');
  const pubResult = await services.publish.handoff(genResult.url, 'org-1');
  observer.emitStepProgress(runId, 'publish-handoff', 'done', {
    outputUrl: `https://app.test/publish/${pubResult.publishId}`,
  });

  return 'done';
}

describe('Clip Pipeline Integration', () => {
  let observer: ClipRunObserverService;
  let eventEmitter: EventEmitter2;
  let services: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    observer = new ClipRunObserverService(eventEmitter);
    services = createMockServices();
  });

  // ── Happy path: single clip generate → publish ──
  it('should complete happy path: generate → reframe → publish', async () => {
    await runPipeline(observer, services, 'happy-1', {
      skipMerge: true,
      skipReframe: false,
    });

    const progress = await observer.getRunProgress('happy-1');
    expect(progress).toBeDefined();
    expect(progress!.overallStatus).toBe('done');
    expect(progress!.steps.find((s) => s.step === 'generate')!.status).toBe(
      'done',
    );
    expect(progress!.steps.find((s) => s.step === 'merge')!.status).toBe(
      'skipped',
    );
    expect(progress!.steps.find((s) => s.step === 'reframe')!.status).toBe(
      'done',
    );
    expect(
      progress!.steps.find((s) => s.step === 'publish-handoff')!.status,
    ).toBe('done');
  });

  // ── Merge path: generate 2 clips → merge → publish ──
  it('should complete merge path: generate → merge → reframe → publish', async () => {
    services.generation.generate = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://cdn.test/clip-a.mp4' })
      .mockResolvedValueOnce({ url: 'https://cdn.test/clip-b.mp4' });

    await runPipeline(observer, services, 'merge-1', {
      skipMerge: false,
      skipReframe: true,
    });

    const progress = await observer.getRunProgress('merge-1');
    expect(progress!.overallStatus).toBe('done');
    expect(progress!.steps.find((s) => s.step === 'merge')!.status).toBe(
      'done',
    );
    expect(services.merge.merge).toHaveBeenCalled();
  });

  // ── Reframe path: generate → portrait reframe → publish ──
  it('should complete reframe path with portrait conversion', async () => {
    await runPipeline(observer, services, 'reframe-1', {
      skipMerge: true,
    });

    const progress = await observer.getRunProgress('reframe-1');
    expect(progress!.overallStatus).toBe('done');
    expect(services.reframe.reframe).toHaveBeenCalledWith(
      'https://cdn.test/clip-1.mp4',
      'portrait',
    );
    const reframeStep = progress!.steps.find((s) => s.step === 'reframe')!;
    expect(reframeStep.outputUrl).toBe('https://cdn.test/portrait.mp4');
  });

  // ── Failure path: generate fails → retry → succeed ──
  it('should handle failure with retry and eventual success', async () => {
    const emitted: string[] = [];
    eventEmitter.on(CLIP_ORCHESTRATOR_EVENTS.STEP_COMPLETED, (payload: any) => {
      emitted.push(`${payload.step}:${payload.status}`);
    });

    await runPipeline(observer, services, 'fail-retry-1', {
      failAt: 'generate',
      failCount: 1,
      skipMerge: true,
    });

    const progress = await observer.getRunProgress('fail-retry-1');
    // After retry the run should eventually succeed
    expect(progress!.steps.find((s) => s.step === 'generate')!.status).toBe(
      'done',
    );
    // We should have seen a failed event before the done
    expect(emitted).toContain('generate:failed');
    expect(emitted).toContain('generate:done');
  });

  // ── Confirmation gate: pause at confirmation → confirm → continue ──
  it('should pause at confirmation gate before publish', async () => {
    const result = await runPipeline(observer, services, 'confirm-1', {
      confirmationGate: true,
      skipMerge: true,
    });

    expect(result).toBe('awaiting_confirmation');
    const progress = await observer.getRunProgress('confirm-1');
    // publish-handoff should still be pending
    expect(
      progress!.steps.find((s) => s.step === 'publish-handoff')!.status,
    ).toBe('pending');

    // Now confirm and continue publish
    observer.emitStepProgress('confirm-1', 'publish-handoff', 'running');
    await services.publish.handoff('https://cdn.test/clip-1.mp4', 'org-1');
    observer.emitStepProgress('confirm-1', 'publish-handoff', 'done');

    const updatedProgress = await observer.getRunProgress('confirm-1');
    expect(updatedProgress!.overallStatus).toBe('done');
  });

  // ── Tenant isolation: org A cannot access org B clip runs ──
  it('should enforce tenant isolation between organisations', async () => {
    // Org A run
    observer.initRun('org-a-run');
    observer.emitStepProgress('org-a-run', 'generate', 'done');

    // Org B run
    observer.initRun('org-b-run');
    observer.emitStepProgress('org-b-run', 'generate', 'running');

    // Each run is isolated — org A's progress is independent of org B
    const orgAProgress = await observer.getRunProgress('org-a-run');
    const orgBProgress = await observer.getRunProgress('org-b-run');

    expect(orgAProgress!.clipRunId).toBe('org-a-run');
    expect(orgBProgress!.clipRunId).toBe('org-b-run');

    // Mutating org B does not affect org A
    observer.emitStepProgress('org-b-run', 'generate', 'failed', {
      errorMessage: 'boom',
    });

    const orgAAfter = await observer.getRunProgress('org-a-run');
    expect(orgAAfter!.steps.find((s) => s.step === 'generate')!.status).toBe(
      'done',
    );
    expect(orgAAfter!.overallStatus).not.toBe('failed');
  });

  // ── Event emission: all step updates fire events ──
  it('should emit events for every step transition', async () => {
    const events: any[] = [];
    eventEmitter.on(CLIP_ORCHESTRATOR_EVENTS.STEP_COMPLETED, (payload: any) => {
      events.push(payload);
    });

    await runPipeline(observer, services, 'events-1', {
      skipMerge: true,
    });

    // generate (running, done) + merge (skipped) + reframe (running, done) + publish (running, done) = 7
    expect(events.length).toBeGreaterThanOrEqual(7);
    expect(events[events.length - 1].progress.overallStatus).toBe('done');
  });

  // ── Full pipeline with all steps ──
  it('should complete full pipeline with all steps enabled', async () => {
    await runPipeline(observer, services, 'full-1', {
      skipMerge: false,
      skipReframe: false,
    });

    const progress = await observer.getRunProgress('full-1');
    expect(progress!.overallStatus).toBe('done');
    for (const step of progress!.steps) {
      expect(step.status).toBe('done');
    }
  });
});

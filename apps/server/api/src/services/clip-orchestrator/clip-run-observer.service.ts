import { CLIP_ORCHESTRATOR_EVENTS } from '@api/services/clip-orchestrator/clip-orchestrator.events';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Steps in the clip run pipeline. */
export type ClipRunStep = 'generate' | 'merge' | 'reframe' | 'publish-handoff';

/** Possible statuses for a step. */
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/** Individual step progress entry. */
export interface StepProgress {
  step: ClipRunStep;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  retryable?: boolean;
  outputUrl?: string;
  meta?: Record<string, unknown>;
}

/** Full progress snapshot for a clip run. */
export interface ClipRunProgress {
  clipRunId: string;
  steps: StepProgress[];
  overallStatus: 'pending' | 'running' | 'done' | 'failed';
  updatedAt: string;
}

/** Ordered pipeline steps for initialisation. */
const ORDERED_STEPS: ClipRunStep[] = [
  'generate',
  'merge',
  'reframe',
  'publish-handoff',
];

/**
 * ClipRunObserverService
 *
 * Tracks step-level progress for clip orchestration runs and emits
 * real-time updates via EventEmitter2. Consumers (websocket gateway,
 * notification publisher, etc.) can subscribe to these events.
 */
@Injectable()
export class ClipRunObserverService {
  /** In-memory progress map keyed by clipRunId. */
  private readonly runs = new Map<string, ClipRunProgress>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Initialise tracking for a new clip run.
   * All steps start as `pending`.
   */
  initRun(clipRunId: string): ClipRunProgress {
    const progress: ClipRunProgress = {
      clipRunId,
      overallStatus: 'pending',
      steps: ORDERED_STEPS.map((step) => ({
        status: 'pending' as StepStatus,
        step,
      })),
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(clipRunId, progress);
    return progress;
  }

  /**
   * Emit a step-level progress update.
   * Updates internal state and fires an event for real-time consumers.
   */
  emitStepProgress(
    clipRunId: string,
    step: ClipRunStep,
    status: StepStatus,
    meta?: Record<string, unknown>,
  ): void {
    let progress = this.runs.get(clipRunId);
    if (!progress) {
      progress = this.initRun(clipRunId);
    }

    const stepEntry = progress.steps.find((s) => s.step === step);
    if (!stepEntry) {
      return;
    }

    stepEntry.status = status;
    stepEntry.meta = meta;

    if (status === 'running' && !stepEntry.startedAt) {
      stepEntry.startedAt = new Date().toISOString();
    }

    if (status === 'done' || status === 'failed' || status === 'skipped') {
      stepEntry.completedAt = new Date().toISOString();
    }

    if (status === 'failed') {
      stepEntry.errorMessage =
        (meta?.errorMessage as string) ?? 'Unknown error';
      stepEntry.retryable = (meta?.retryable as boolean) ?? false;
    }

    if (status === 'done' && meta?.outputUrl) {
      stepEntry.outputUrl = meta.outputUrl as string;
    }

    // Recompute overall status
    progress.overallStatus = this.computeOverallStatus(progress.steps);
    progress.updatedAt = new Date().toISOString();

    // Emit event for real-time consumers
    this.eventEmitter.emit(CLIP_ORCHESTRATOR_EVENTS.STEP_COMPLETED, {
      clipRunId,
      meta,
      progress: { ...progress },
      status,
      step,
    });
  }

  /**
   * Get the full progress snapshot for a clip run.
   */
  async getRunProgress(clipRunId: string): Promise<ClipRunProgress | null> {
    return this.runs.get(clipRunId) ?? null;
  }

  /**
   * Remove tracking for a completed/abandoned run.
   */
  clearRun(clipRunId: string): void {
    this.runs.delete(clipRunId);
  }

  /** Derive overall status from individual steps. */
  private computeOverallStatus(
    steps: StepProgress[],
  ): ClipRunProgress['overallStatus'] {
    if (steps.some((s) => s.status === 'failed')) {
      return 'failed';
    }
    if (steps.some((s) => s.status === 'running')) {
      return 'running';
    }
    if (steps.every((s) => s.status === 'done' || s.status === 'skipped')) {
      return 'done';
    }
    if (steps.some((s) => s.status === 'done' || s.status === 'skipped')) {
      return 'running';
    }
    return 'pending';
  }
}

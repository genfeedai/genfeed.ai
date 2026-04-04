import { randomUUID } from 'node:crypto';
import {
  CLIP_ORCHESTRATOR_EVENTS,
  type ClipRunConfirmationEvent,
  type ClipRunStateChangeEvent,
} from '@api/services/clip-orchestrator/clip-orchestrator.events';
import {
  ClipRunState,
  CONFIRMATION_CHECKPOINTS,
  PIPELINE_STATES,
  VALID_TRANSITIONS,
} from '@api/services/clip-orchestrator/clip-run-state.enum';
import type { ClipRunStepDto } from '@api/services/clip-orchestrator/dto/clip-run-step.dto';
import type { StartClipRunDto } from '@api/services/clip-orchestrator/dto/start-clip-run.dto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Maximum retry attempts per step. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff in ms. */
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Represents an active clip run's in-memory state.
 */
export interface ClipRun {
  id: string;
  projectId: string;
  userId: string;
  organizationId: string;
  currentState: ClipRunState;
  confirmationRequired: boolean;
  skipMerging: boolean;
  steps: ClipRunStepDto[];
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ClipOrchestratorService
 *
 * State machine for clip run lifecycle with retries, failures,
 * and optional user confirmations at checkpoint transitions.
 */
@Injectable()
export class ClipOrchestratorService {
  /** In-memory store of active runs (keyed by run ID). */
  private readonly runs = new Map<string, ClipRun>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Start a new clip orchestration run.
   */
  startRun(dto: StartClipRunDto): ClipRun {
    const run: ClipRun = {
      confirmationRequired: dto.confirmationRequired ?? false,
      createdAt: new Date(),
      currentState: ClipRunState.Idle,
      id: randomUUID(),
      metadata: dto.metadata,
      organizationId: dto.organizationId,
      projectId: dto.projectId,
      skipMerging: dto.skipMerging ?? false,
      steps: [],
      updatedAt: new Date(),
      userId: dto.userId,
    };

    this.runs.set(run.id, run);
    return run;
  }

  /**
   * Retrieve a run by ID.
   */
  getRun(runId: string): ClipRun | undefined {
    return this.runs.get(runId);
  }

  /**
   * Transition a run to the next state.
   * Validates the transition is legal. If confirmationRequired is true
   * and the target state is a checkpoint, the run pauses in
   * `awaiting_confirmation` instead.
   */
  transition(runId: string, targetState: ClipRunState): ClipRun {
    const run = this.getRunOrThrow(runId);
    const fromState = run.currentState;

    // Check if confirmation is needed at this checkpoint
    if (
      run.confirmationRequired &&
      CONFIRMATION_CHECKPOINTS.has(targetState) &&
      fromState !== ClipRunState.AwaitingConfirmation
    ) {
      this.validateTransition(fromState, ClipRunState.AwaitingConfirmation);
      return this.applyTransition(
        run,
        ClipRunState.AwaitingConfirmation,
        targetState,
      );
    }

    this.validateTransition(fromState, targetState);
    return this.applyTransition(run, targetState);
  }

  /**
   * Confirm a paused run and proceed to the pending state.
   */
  confirm(runId: string): ClipRun {
    const run = this.getRunOrThrow(runId);

    if (run.currentState !== ClipRunState.AwaitingConfirmation) {
      throw new Error(
        `Run ${runId} is not awaiting confirmation (current: ${run.currentState})`,
      );
    }

    // Find what state we were heading to — stored in the last step's output
    const lastStep = run.steps[run.steps.length - 1];
    const pendingState = lastStep?.output?.pendingState as
      | ClipRunState
      | undefined;

    if (!pendingState) {
      throw new Error(`Run ${runId} has no pending state to confirm`);
    }

    this.validateTransition(ClipRunState.AwaitingConfirmation, pendingState);
    return this.applyTransition(run, pendingState);
  }

  /**
   * Record a step failure. Increments retry count and transitions to failed
   * if retries are exhausted.
   */
  failStep(runId: string, error: string): ClipRun {
    const run = this.getRunOrThrow(runId);

    // Find or create the current step
    const currentStep = this.getCurrentStep(run);
    currentStep.retryCount += 1;
    currentStep.error = error;

    if (currentStep.retryCount >= MAX_RETRIES) {
      // Exhausted retries — fail the run
      currentStep.completedAt = new Date();
      run.error = `Step ${run.currentState} failed after ${MAX_RETRIES} retries: ${error}`;
      this.applyTransition(run, ClipRunState.Failed);

      this.eventEmitter.emit(CLIP_ORCHESTRATOR_EVENTS.RUN_FAILED, {
        error: run.error,
        projectId: run.projectId,
        runId: run.id,
        state: run.currentState,
        timestamp: new Date(),
      });

      return run;
    }

    // Emit retry event
    this.eventEmitter.emit(CLIP_ORCHESTRATOR_EVENTS.STEP_RETRYING, {
      error,
      projectId: run.projectId,
      retryCount: currentStep.retryCount,
      runId: run.id,
      state: run.currentState,
      timestamp: new Date(),
    });

    return run;
  }

  /**
   * Calculate the backoff delay for a step's current retry attempt.
   */
  getRetryDelay(runId: string): number {
    const run = this.getRunOrThrow(runId);
    const currentStep = this.findCurrentStep(run);
    const retryCount = currentStep?.retryCount ?? 0;
    return BASE_RETRY_DELAY_MS * 2 ** retryCount;
  }

  /**
   * Check whether a retry is still possible for the current step.
   */
  canRetry(runId: string): boolean {
    const run = this.getRunOrThrow(runId);
    const currentStep = this.findCurrentStep(run);
    return (currentStep?.retryCount ?? 0) < MAX_RETRIES;
  }

  /**
   * Retry a failed run from the last known good state.
   */
  retryFromLastGood(runId: string): ClipRun {
    const run = this.getRunOrThrow(runId);

    if (run.currentState !== ClipRunState.Failed) {
      throw new Error(
        `Run ${runId} is not in failed state (current: ${run.currentState})`,
      );
    }

    // Find the last successfully completed step
    const lastGoodStep = [...run.steps]
      .reverse()
      .find((s) => s.completedAt && !s.error);

    const retryState = lastGoodStep?.state ?? ClipRunState.Idle;
    run.error = undefined;

    this.validateTransition(ClipRunState.Failed, retryState);
    return this.applyTransition(run, retryState);
  }

  /**
   * Get the next state in the pipeline for a given run,
   * respecting the skipMerging flag.
   */
  getNextState(runId: string): ClipRunState | null {
    const run = this.getRunOrThrow(runId);
    const currentIndex = PIPELINE_STATES.indexOf(run.currentState);

    if (currentIndex === -1 || currentIndex >= PIPELINE_STATES.length - 1) {
      return null;
    }

    let nextIndex = currentIndex + 1;

    // Skip merging if flagged
    if (
      run.skipMerging &&
      PIPELINE_STATES[nextIndex] === ClipRunState.Merging
    ) {
      nextIndex += 1;
    }

    return PIPELINE_STATES[nextIndex] ?? null;
  }

  /**
   * Mark the current step as completed with optional output data.
   */
  completeStep(runId: string, output?: Record<string, unknown>): ClipRun {
    const run = this.getRunOrThrow(runId);
    const step = this.getCurrentStep(run);
    step.completedAt = new Date();
    step.output = output;
    run.updatedAt = new Date();

    this.eventEmitter.emit(CLIP_ORCHESTRATOR_EVENTS.STEP_COMPLETED, {
      output,
      projectId: run.projectId,
      runId: run.id,
      state: run.currentState,
      timestamp: new Date(),
    });

    return run;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private getRunOrThrow(runId: string): ClipRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Clip run not found: ${runId}`);
    }
    return run;
  }

  private validateTransition(from: ClipRunState, to: ClipRunState): void {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed?.has(to)) {
      throw new Error(`Invalid state transition: ${from} → ${to}`);
    }
  }

  private applyTransition(
    run: ClipRun,
    targetState: ClipRunState,
    pendingState?: ClipRunState,
  ): ClipRun {
    const previousState = run.currentState;
    run.currentState = targetState;
    run.updatedAt = new Date();

    // Create a step record for the new state
    const step: ClipRunStepDto = {
      output: pendingState ? { pendingState } : undefined,
      retryCount: 0,
      startedAt: new Date(),
      state: targetState,
      stepId: randomUUID(),
    };
    run.steps.push(step);

    // Emit state change event
    const event: ClipRunStateChangeEvent = {
      currentState: targetState,
      metadata: run.metadata,
      previousState,
      projectId: run.projectId,
      runId: run.id,
      timestamp: new Date(),
    };
    this.eventEmitter.emit(CLIP_ORCHESTRATOR_EVENTS.STATE_CHANGED, event);

    // Emit confirmation event if entering awaiting_confirmation
    if (targetState === ClipRunState.AwaitingConfirmation && pendingState) {
      const confirmEvent: ClipRunConfirmationEvent = {
        pendingState,
        projectId: run.projectId,
        runId: run.id,
        timestamp: new Date(),
      };
      this.eventEmitter.emit(
        CLIP_ORCHESTRATOR_EVENTS.CONFIRMATION_REQUIRED,
        confirmEvent,
      );
    }

    // Emit run completed if done
    if (targetState === ClipRunState.Done) {
      this.eventEmitter.emit(CLIP_ORCHESTRATOR_EVENTS.RUN_COMPLETED, {
        projectId: run.projectId,
        runId: run.id,
        timestamp: new Date(),
      });
    }

    return run;
  }

  private getCurrentStep(run: ClipRun): ClipRunStepDto {
    const existing = this.findCurrentStep(run);
    if (existing) return existing;

    // Create a step for the current state
    const step: ClipRunStepDto = {
      retryCount: 0,
      startedAt: new Date(),
      state: run.currentState,
      stepId: randomUUID(),
    };
    run.steps.push(step);
    return step;
  }

  private findCurrentStep(run: ClipRun): ClipRunStepDto | undefined {
    return [...run.steps]
      .reverse()
      .find((s) => s.state === run.currentState && !s.completedAt);
  }
}

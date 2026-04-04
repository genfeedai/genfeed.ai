import type { RunActionType, RunRecord, RunTimelineEvent } from '@/types';

export interface ContentLoopStep {
  id: string;
  actionType: RunActionType;
  input: Record<string, unknown>;
  requireConfirmation?: boolean;
  haltOnRejection?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ContentLoopResult {
  runs: RunRecord[];
  skippedSteps: string[];
  timeline: RunTimelineEvent[];
  abortedAt?: string;
}

interface ExecuteRunOptions {
  metadata?: Record<string, unknown>;
}

interface ExecuteContentLoopOptions {
  steps: ContentLoopStep[];
  executeRun: (
    actionType: RunActionType,
    input: Record<string, unknown>,
    options?: ExecuteRunOptions,
  ) => Promise<RunRecord>;
  confirmStep?: (step: ContentLoopStep) => Promise<boolean>;
}

function timelineEvent(
  stage: string,
  message: string,
  level: RunTimelineEvent['level'] = 'info',
  data?: Record<string, unknown>,
): RunTimelineEvent {
  return {
    data,
    level,
    message,
    stage,
    timestamp: new Date().toISOString(),
  };
}

export async function executeContentLoop({
  steps,
  executeRun,
  confirmStep,
}: ExecuteContentLoopOptions): Promise<ContentLoopResult> {
  const timeline: RunTimelineEvent[] = [];
  const runs: RunRecord[] = [];
  const skippedSteps: string[] = [];

  for (const step of steps) {
    timeline.push(
      timelineEvent(step.id, `Preparing ${step.actionType} step`, 'info', {
        actionType: step.actionType,
      }),
    );

    if (step.requireConfirmation && confirmStep) {
      const approved = await confirmStep(step);
      if (!approved) {
        skippedSteps.push(step.id);
        timeline.push(
          timelineEvent(step.id, `Skipped ${step.actionType} step`, 'warn'),
        );

        if (step.haltOnRejection) {
          timeline.push(
            timelineEvent(
              step.id,
              'Content loop aborted due to required confirmation rejection',
              'warn',
            ),
          );
          return {
            abortedAt: step.id,
            runs,
            skippedSteps,
            timeline,
          };
        }

        continue;
      }
    }

    const run = await executeRun(step.actionType, step.input, {
      metadata: step.metadata,
    });
    runs.push(run);
    timeline.push(
      timelineEvent(step.id, `${step.actionType} step executed`, 'info', {
        runId: run._id || run.id,
        status: run.status,
      }),
    );
  }

  return {
    runs,
    skippedSteps,
    timeline,
  };
}

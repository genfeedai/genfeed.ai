import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from './analytics-events';
import { createEditorWorkflowRunTracker } from './workflow-run-tracker';

describe('createEditorWorkflowRunTracker', () => {
  it('does not treat an accepted launch as success', () => {
    const capture = vi.fn();
    const tracker = createEditorWorkflowRunTracker(capture);

    tracker.trackStarted();
    tracker.trackLaunchAccepted('exec-1');

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.WORKFLOW_RUN_STARTED,
      {
        workflowType: 'editor',
      },
    );
  });

  it('records failure when a pending launch fails before an execution id exists', () => {
    const capture = vi.fn();
    const tracker = createEditorWorkflowRunTracker(capture);

    tracker.trackStarted();
    tracker.trackLaunchFailed();
    tracker.trackLaunchFailed();

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenLastCalledWith(
      ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED,
      {
        outcome: 'failure',
        workflowType: 'editor',
      },
    );
  });

  it('ignores terminal events for executions that were not launched here', () => {
    const capture = vi.fn();
    const tracker = createEditorWorkflowRunTracker(capture);

    tracker.trackTerminalExecution({
      id: 'other',
      status: WorkflowExecutionStatus.COMPLETED,
    });

    expect(capture).not.toHaveBeenCalled();
  });

  it('emits success or failure only for tracked terminal statuses', () => {
    const capture = vi.fn();
    const tracker = createEditorWorkflowRunTracker(capture);

    tracker.trackStarted();
    tracker.trackLaunchAccepted('exec-ok');
    tracker.trackTerminalExecution({
      id: 'exec-ok',
      status: WorkflowExecutionStatus.RUNNING,
    });
    tracker.trackTerminalExecution({
      id: 'exec-ok',
      status: WorkflowExecutionStatus.COMPLETED,
    });
    tracker.trackTerminalExecution({
      id: 'exec-ok',
      status: WorkflowExecutionStatus.FAILED,
    });

    tracker.trackStarted();
    tracker.trackLaunchAccepted('exec-fail');
    tracker.trackTerminalExecution({
      id: 'exec-fail',
      status: WorkflowExecutionStatus.CANCELLED,
    });

    expect(capture).toHaveBeenCalledTimes(4);
    expect(capture).toHaveBeenNthCalledWith(
      2,
      ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED,
      {
        outcome: 'success',
        workflowType: 'editor',
      },
    );
    expect(capture).toHaveBeenNthCalledWith(
      4,
      ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED,
      {
        outcome: 'failure',
        workflowType: 'editor',
      },
    );
  });
});

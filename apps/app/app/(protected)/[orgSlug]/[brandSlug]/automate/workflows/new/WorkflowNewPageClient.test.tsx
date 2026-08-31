import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_EVENTS,
  createEditorWorkflowRunTracker,
} from '@/lib/analytics';

const relativePath =
  'app/(protected)/[orgSlug]/[brandSlug]/automate/workflows/new/WorkflowNewPageClient.tsx';

assertSourceHasExport(relativePath);

describe(relativePath, () => {
  it('uses the canonical execution id for the active run', () => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

    expect(source).toContain('setActiveExecutionId(execution.id)');
    expect(source).not.toContain('execution?._id');
  });

  it('keeps the toolbar mounted during the initial workflow load instead of blanking the page', () => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

    // The toolbar is built once and reused by both the loading branch and the
    // loaded WorkflowEditorShell, so it never unmounts while data loads.
    expect(source).toContain('const toolbarElement = (');
    expect(source).toContain('data-testid="workflow-editor-loading-shell"');
    expect(source).toContain('{toolbarElement}');
    expect(source).toContain('toolbar={toolbarElement}');
    // No full-page early return remains: the loading branch renders the same
    // <main> chrome as the loaded shell, not a bare full-screen placeholder.
    expect(source).not.toMatch(/if \(isLoading\) return/);
    expect(source).not.toContain('min-h-screen items-center justify-center');
  });

  it('tracks bounded workflow start and terminal outcomes', () => {
    const capture = vi.fn();
    const tracker = createEditorWorkflowRunTracker(capture);

    tracker.trackStarted();
    tracker.trackLaunchAccepted('execution-1');
    tracker.trackTerminalExecution({
      id: 'execution-1',
      status: WorkflowExecutionStatus.RUNNING,
    });
    tracker.trackTerminalExecution({
      id: 'execution-1',
      status: WorkflowExecutionStatus.FAILED,
    });

    expect(capture.mock.calls).toEqual([
      [ANALYTICS_EVENTS.WORKFLOW_RUN_STARTED, { workflowType: 'editor' }],
      [
        ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED,
        { outcome: 'failure', workflowType: 'editor' },
      ],
    ]);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_EVENTS,
  createEditorWorkflowRunTracker,
} from '@/lib/analytics';

const relativePath =
  'app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/[id]/WorkflowDetailPageClient.tsx';

assertSourceHasExport(relativePath);

describe(relativePath, () => {
  it('uses the canonical execution id for the active run', () => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

    expect(source).toContain('setActiveExecutionId(execution.id)');
    expect(source).not.toContain('execution._id');
  });

  it('separates module actions from graph authoring chrome', () => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

    expect(source).toContain('<WorkflowEditorSectionTopbar');
    expect(source).toContain('<ActionNodeInspector />');
    expect(source).toContain(
      'workflow-editor-shell flex h-full min-h-0 flex-col overflow-hidden',
    );
    expect(source).not.toContain('WorkflowEditorToolbarNavigation');
    expect(source).not.toContain('rightContent=');
  });

  it('keeps module chrome mounted while the workflow loads', () => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

    expect(source).toContain('<WorkflowEditorSectionTopbar');
    expect(source).toContain('data-testid="workflow-editor-loading-shell"');
    expect(source).not.toMatch(/if \(isLoading\) \{/);
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
      status: WorkflowExecutionStatus.COMPLETED,
    });
    tracker.trackTerminalExecution({
      id: 'execution-1',
      status: WorkflowExecutionStatus.FAILED,
    });

    expect(capture.mock.calls).toEqual([
      [ANALYTICS_EVENTS.WORKFLOW_RUN_STARTED, { workflowType: 'editor' }],
      [
        ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED,
        { outcome: 'success', workflowType: 'editor' },
      ],
    ]);
  });
});

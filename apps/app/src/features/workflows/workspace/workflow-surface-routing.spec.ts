import { describe, expect, it } from 'vitest';
import {
  appendWorkflowThread,
  resolveWorkflowSurfaceRoute,
} from './workflow-surface-routing';

describe('workflow surface routing', () => {
  it('resolves focused graph editors under automation/workflows', () => {
    expect(
      resolveWorkflowSurfaceRoute(
        '/acme/moonrise/automation/workflows/workflow-1',
        new URLSearchParams({ execution: 'run-1', thread: 'thread-1' }),
      ),
    ).toEqual({
      executionId: 'run-1',
      isGraphCanvas: true,
      runsBaseHref: '/acme/moonrise/automation/runs',
      workflowBaseHref: '/acme/moonrise/automation/workflows',
      workflowId: 'workflow-1',
    });
  });

  it('resolves brand and organization run inspection canvases', () => {
    expect(
      resolveWorkflowSurfaceRoute(
        '/acme/moonrise/automation/runs/run-1',
        new URLSearchParams(),
      ),
    ).toEqual({
      executionId: 'run-1',
      isGraphCanvas: false,
      runsBaseHref: '/acme/moonrise/automation/runs',
      workflowBaseHref: '/acme/moonrise/automation/workflows',
      workflowId: null,
    });
  });

  it('keeps the canonical templates page in the workflow inspector family', () => {
    expect(
      resolveWorkflowSurfaceRoute(
        '/acme/moonrise/automation/templates',
        new URLSearchParams(),
      ),
    ).toEqual({
      executionId: null,
      isGraphCanvas: false,
      runsBaseHref: '/acme/moonrise/automation/runs',
      workflowBaseHref: '/acme/moonrise/automation/workflows',
      workflowId: null,
    });
  });

  it('preserves opaque queries while restoring the connected thread', () => {
    expect(
      appendWorkflowThread(
        '/acme/moonrise/automation/workflows/workflow-1?execution=run-1',
        'thread-1',
      ),
    ).toBe(
      '/acme/moonrise/automation/workflows/workflow-1?execution=run-1&thread=thread-1',
    );
  });
});

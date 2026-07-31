import { describe, expect, it } from 'vitest';
import {
  appendWorkflowThread,
  resolveWorkflowSurfaceRoute,
} from './workflow-surface-routing';

describe('workflow surface routing', () => {
  it('resolves focused graph editors under orchestration/workflows', () => {
    expect(
      resolveWorkflowSurfaceRoute(
        '/acme/moonrise/orchestration/workflows/workflow-1',
        new URLSearchParams({ execution: 'run-1', thread: 'thread-1' }),
      ),
    ).toEqual({
      executionId: 'run-1',
      isGraphCanvas: true,
      workflowBaseHref: '/acme/moonrise/orchestration/workflows',
      workflowId: 'workflow-1',
    });
  });

  it('resolves brand and organization run inspection canvases', () => {
    expect(
      resolveWorkflowSurfaceRoute(
        '/acme/moonrise/orchestration/workflows/executions/run-1',
        new URLSearchParams(),
      ),
    ).toEqual({
      executionId: 'run-1',
      isGraphCanvas: false,
      workflowBaseHref: '/acme/moonrise/orchestration/workflows',
      workflowId: null,
    });
  });

  it('preserves opaque queries while restoring the connected thread', () => {
    expect(
      appendWorkflowThread(
        '/acme/moonrise/orchestration/workflows/workflow-1?execution=run-1',
        'thread-1',
      ),
    ).toBe(
      '/acme/moonrise/orchestration/workflows/workflow-1?execution=run-1&thread=thread-1',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { appendWorkflowThread } from './workflow-surface-routing';

describe('workflow surface routing', () => {
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

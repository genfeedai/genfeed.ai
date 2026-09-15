import { WorkflowSerializer } from '@serializers/server/automation/workflow.serializer';
import { describe, expect, it } from 'vitest';

describe('WorkflowSerializer graph settings', () => {
  it('exposes the persisted edge style for editor reload', () => {
    expect(
      WorkflowSerializer.serialize({ id: 'workflow-1', edgeStyle: 'straight' }),
    ).toMatchObject({
      data: { attributes: { edgeStyle: 'straight' } },
    });
  });
});

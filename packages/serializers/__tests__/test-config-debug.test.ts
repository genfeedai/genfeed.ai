import { WorkflowSerializer } from '@serializers/server/automation/workflow.serializer';
import { describe, expect, it } from 'vitest';

describe('test', () => {
  it('works', () => {
    expect(WorkflowSerializer).toBeDefined();
  });
});

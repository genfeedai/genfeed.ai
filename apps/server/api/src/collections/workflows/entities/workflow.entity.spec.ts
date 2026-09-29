import { WorkflowEntity } from '@api/collections/workflows/entities/workflow.entity';

describe('WorkflowEntity', () => {
  it('should create an instance', () => {
    const entity = new WorkflowEntity();
    expect(entity).toBeInstanceOf(WorkflowEntity);
  });
});

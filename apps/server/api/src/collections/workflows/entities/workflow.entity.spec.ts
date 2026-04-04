import { WorkflowEntity } from '@api/collections/workflows/entities/workflow.entity';

describe('WorkflowEntity', () => {
  it('should be defined', () => {
    expect(WorkflowEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new WorkflowEntity();
    expect(entity).toBeInstanceOf(WorkflowEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new WorkflowEntity();
  //     // Test properties
  //   });
  // });
});

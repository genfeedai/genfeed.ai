import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';

describe('WorkflowExecutionController RBAC', () => {
  it('should require owner, admin, or creator role for patchNodes', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.patchNodes,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });
});

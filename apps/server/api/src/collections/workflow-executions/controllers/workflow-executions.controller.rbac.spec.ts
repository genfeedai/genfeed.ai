import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';

describe('WorkflowExecutionsController RBAC', () => {
  it('should require owner, admin, or creator role for update', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionsController.prototype.update,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });
});

import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';

describe('WorkflowExecutionsController RBAC', () => {
  it('should require owner, admin, or creator role for create', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionsController.prototype.create,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for cancel', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionsController.prototype.cancel,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should not require a role for findAll, getWorkflowExecutions, getExecutionStats, or findOne', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        WorkflowExecutionsController.prototype.findAll,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'roles',
        WorkflowExecutionsController.prototype.getWorkflowExecutions,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'roles',
        WorkflowExecutionsController.prototype.getExecutionStats,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'roles',
        WorkflowExecutionsController.prototype.findOne,
      ),
    ).toBeUndefined();
  });
});

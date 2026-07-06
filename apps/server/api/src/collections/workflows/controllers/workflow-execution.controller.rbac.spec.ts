import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';

describe('WorkflowExecutionController RBAC', () => {
  it('should require owner, admin, or creator role for executePartial', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.executePartial,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for resumeExecution', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.resumeExecution,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for submitApproval', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.submitApproval,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for patchNodes', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.patchNodes,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should not require a role for getCreditsEstimate or getExecutionLogs', () => {
    expect(
      Reflect.getMetadata(
        'roles',
        WorkflowExecutionController.prototype.getCreditsEstimate,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'roles',
        WorkflowExecutionController.prototype.getExecutionLogs,
      ),
    ).toBeUndefined();
  });
});

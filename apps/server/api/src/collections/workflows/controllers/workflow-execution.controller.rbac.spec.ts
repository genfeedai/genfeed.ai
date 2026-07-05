import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';

describe('WorkflowExecutionController RBAC', () => {
  it('should require owner, admin, or creator role for setSchedule', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.setSchedule,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for removeSchedule', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.removeSchedule,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

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

  it('should require owner, admin, or creator role for publishWorkflowLifecycle', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.publishWorkflowLifecycle,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for archiveWorkflow', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.archiveWorkflow,
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

  it('should require owner, admin, or creator role for lockNodes', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.lockNodes,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for unlockNodes', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.unlockNodes,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for setThumbnail', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowExecutionController.prototype.setThumbnail,
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

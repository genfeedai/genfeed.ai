import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';

describe('WorkflowCrudController RBAC', () => {
  it('should require owner, admin, or creator role for create', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowCrudController.prototype.create,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for cloneWorkflow', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowCrudController.prototype.cloneWorkflow,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for update', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowCrudController.prototype.update,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should require owner, admin, or creator role for remove', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowCrudController.prototype.remove,
    );
    expect(metadata).toEqual(['owner', 'admin', 'creator']);
  });

  it('should not require a role for findAll, getStatistics, exportComfyUI, or findOne', () => {
    expect(
      Reflect.getMetadata('roles', WorkflowCrudController.prototype.findAll),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'roles',
        WorkflowCrudController.prototype.getStatistics,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'roles',
        WorkflowCrudController.prototype.exportComfyUI,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('roles', WorkflowCrudController.prototype.findOne),
    ).toBeUndefined();
  });
});

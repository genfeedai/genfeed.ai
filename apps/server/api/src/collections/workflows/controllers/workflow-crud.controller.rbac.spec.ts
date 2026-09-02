import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { assertCanIncludeSystemWorkflows } from '@api/collections/workflows/utils/workflow-system-access.util';
import type { Request } from 'express';

describe('WorkflowCrudController RBAC', () => {
  it('should require owner, admin, or creator role for create', () => {
    const metadata = Reflect.getMetadata(
      'roles',
      WorkflowCrudController.prototype.create,
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

  it('keeps ordinary findAll access open to organization members', () => {
    expect(
      Reflect.getMetadata('roles', WorkflowCrudController.prototype.findAll),
    ).toBeUndefined();
  });

  it('rejects the includeSystem flag without platform-superadmin context', () => {
    expect(() =>
      assertCanIncludeSystemWorkflows(
        {} as Request,
        { isSuperAdmin: false } as User,
        true,
      ),
    ).toThrow();

    expect(() =>
      assertCanIncludeSystemWorkflows(
        {} as Request,
        { isSuperAdmin: true } as User,
        true,
      ),
    ).not.toThrow();
  });

  it('should not require a role for exportComfyUI or findOne', () => {
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

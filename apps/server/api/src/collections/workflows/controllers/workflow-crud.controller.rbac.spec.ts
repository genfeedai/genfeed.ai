import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { assertCanIncludeSystemWorkflows } from '@api/collections/workflows/utils/workflow-system-access.util';
import type { Request } from 'express';

describe('WorkflowCrudController RBAC', () => {
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
});

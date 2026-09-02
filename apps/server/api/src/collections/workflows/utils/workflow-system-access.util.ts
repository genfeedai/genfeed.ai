import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import type { Request } from 'express';

export function assertCanIncludeSystemWorkflows(
  request: Request,
  user: User,
  includeSystem: boolean,
): void {
  if (includeSystem && !getIsSuperAdmin(user, request)) {
    ErrorResponse.forbidden(
      'Only platform superadmins can include persisted system workflows',
    );
  }
}

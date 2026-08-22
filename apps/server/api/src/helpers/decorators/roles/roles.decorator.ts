import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const SKIP_ROLES_KEY = 'skipRoles';

export const RolesDecorator = (...args: string[]) =>
  SetMetadata(ROLES_KEY, args);

/**
 * Skip role and active-organization membership checks for an authenticated,
 * self-scoped discovery handler. The handler must enforce its own data scope.
 */
export const SkipRoles = () => SetMetadata(SKIP_ROLES_KEY, true);

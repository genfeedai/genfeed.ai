import { AsyncLocalStorage } from 'node:async_hooks';
import {
  ORGANIZATION_MODULES,
  type OrganizationModuleId,
} from '@genfeedai/contracts/constants';

export interface OrganizationModuleExecutionContext {
  moduleId: OrganizationModuleId;
  organizationId: string;
}

const storage = new AsyncLocalStorage<
  Readonly<OrganizationModuleExecutionContext>
>();

/** A server adapter sets this context after authentication and admission. */
export function runWithOrganizationModule<T>(
  context: OrganizationModuleExecutionContext,
  callback: () => T,
): T {
  if (
    !context.organizationId.trim() ||
    !Object.hasOwn(ORGANIZATION_MODULES, context.moduleId)
  )
    throw new Error('Authenticated module execution context is required');
  return storage.run(
    Object.freeze({
      moduleId: context.moduleId,
      organizationId: context.organizationId,
    }),
    callback,
  );
}

export function getOrganizationModuleExecutionContext():
  | Readonly<OrganizationModuleExecutionContext>
  | undefined {
  return storage.getStore();
}
